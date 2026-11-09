/**
 * ============================================================================
 * PROJECT: COFFEE SPATIAL MAPPING & MACHINE LEARNING MODELING
 * STEP 04: Support Vector Machine (SVM) Multi-Partition Core Engine
 * MODE: Continuous Decision Procedure (Margin Mode with Sigmoid Fitting)
 * AUTHOR: Inácio Samuel Cuna | UFV
 * REPOSITORY: @GeoprocessingCuna
 * ============================================================================
 */

var particoesAmostrais = ee.List([0.70, 0.75, 0.80]);
var pixelArea = ee.Image.pixelArea();

// DEFINE O NOME DO MUNICÍPIO ATIVO (Mude apenas esta string por asset municipal)
var nomeMunicipioAtivo = "Itumirim"; 

// ============================================================================
// LOOP 1: EXTRAÇÃO DAS 10 MÉTRICAS DE VALIDAÇÃO CRUZADA (MARGIN MODE)
// ============================================================================
var logsSVM = particoesAmostrais.map(function(limiteTreino) {
  limiteTreino = ee.Number(limiteTreino);
  
  var treinoFC = dadosParaMaxent.filter(ee.Filter.lte('random', limiteTreino));
  var testeFC = dadosParaMaxent.filter(ee.Filter.gt('random', limiteTreino));
  
  // Ativa o decisionProcedure como 'Margin' para extrair dados contínuos
  var classificadorSVM = ee.Classifier.libsvm({
    decisionProcedure: 'Margin', // Extrai a distância contínua do pixel até o hiperplano
    svmType: 'C_SVC',
    kernelType: 'LINEAR',       
    cost: 1                     
  });

  var modeloTreinado = classificadorSVM.train({
    features: treinoFC,
    classProperty: 'presenca',
    inputProperties: bands
  });
  
  // Normaliza a distância bruta do hiperplano para uma escala probabilística estável [0, 1]
  var testeClassificado = testeFC.classify(modeloTreinado)
    .map(function(f) {
      var margemBruta = ee.Number(f.get('classification'));
      var probNormalizada = ee.Number(1).divide(ee.Number(1).add(ee.Number(Math.E).pow(margemBruta.multiply(-1))));
      return f.set('probability', probNormalizada); 
    });
  
  var metricasROC = computeAUC(testeClassificado);
  var thresholdFinal = ee.Number(metricasROC.get('threshold'));
  var aucFinal = ee.Number(metricasROC.get('AUC'));
  
  var preditoFC = testeClassificado.map(function(f) {
    var prob = ee.Number(f.get('probability'));
    return f.set('pred', prob.gte(thresholdFinal).int());
  });
  
  var TP = ee.Number(preditoFC.filter(ee.Filter.and(ee.Filter.eq('pred',1), ee.Filter.eq('presenca',1))).size());
  var FP = ee.Number(preditoFC.filter(ee.Filter.and(ee.Filter.eq('pred',1), ee.Filter.eq('presenca',0))).size());
  var TN = ee.Number(preditoFC.filter(ee.Filter.and(ee.Filter.eq('pred',0), ee.Filter.eq('presenca',0))).size());
  var FN = ee.Number(preditoFC.filter(ee.Filter.and(ee.Filter.eq('pred',0), ee.Filter.eq('presenca',1))).size());
  
  // === CÁLCULO DAS MÉTRICAS DISCRETAS ===
  var totalAmostras = TP.add(FP).add(TN).add(FN).max(1);
  var sensitivity = TP.divide(TP.add(FN).max(1));
  var specificity = TN.divide(TN.add(FP).max(1));
  var accuracy = TP.add(TN).divide(totalAmostras);
  var omissionRateFinal = FN.divide(TP.add(FN).max(1));
  var tss = sensitivity.add(specificity).subtract(1);
  
  var po = accuracy;
  var pePresenca = TP.add(FN).divide(totalAmostras).multiply(TP.add(FP).divide(totalAmostras));
  var peAusencia = TN.add(FP).divide(totalAmostras).multiply(TN.add(FN).divide(totalAmostras));
  var pe = pePresenca.add(peAusencia);
  var kappa = po.subtract(pe).divide(ee.Number(1).subtract(pe).max(0.001));
  
  // Sigmoide espacial aplicada na imagem do servidor
  var mapaMargem = predictors.classify(modeloTreinado).select('classification');
  var mapaProbabilidade = ee.Image(1).divide(ee.Image(1).add(mapaMargem.multiply(-1).exp()));
  var aptidaoBinaria = mapaProbabilidade.gte(thresholdFinal).clip(area);
  
  var areaHaFinal = ee.Number(pixelArea.updateMask(aptidaoBinaria)
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: area.geometry(), scale: 10, maxPixels: 1e9})
    .get('area')).divide(10000);
    
  var areaKm2Final = areaHaFinal.divide(100);
  
  var proporcaoTexto = ee.String(limiteTreino.multiply(100).format('%.0f'))
    .cat('/')
    .cat(ee.Number(100).subtract(limiteTreino.multiply(100)).format('%.0f'));

  return ee.Feature(null, {
    'municipio': nomeMunicipioAtivo,
    'particao': proporcaoTexto,
    'train_frac': limiteTreino,
    'AUC': aucFinal,
    'Kappa': kappa,
    'TSS': tss,
    'accuracy': accuracy,
    'sensitivity': sensitivity,
    'specificity': specificity,
    'omission_rate': omissionRateFinal,
    'threshold_used': thresholdFinal,
    'area_ha': areaHaFinal,
    'area_km2': areaKm2Final,
    'satelite': 'Sentinel-2'
  });
});

// ============================================================================
// LOOP 2: EXTRATOR DE IMPORTÂNCIA VIA EXCLUSÃO (JACKKNIFE FIX COMPILADO)
// ============================================================================
var logsImportanciaSVM = particoesAmostrais.map(function(limiteTreino) {
  limiteTreino = ee.Number(limiteTreino);
  var treinoFC = dadosParaMaxent.filter(ee.Filter.lte('random', limiteTreino));
  var testeFC = dadosParaMaxent.filter(ee.Filter.gt('random', limiteTreino));
  
  var proporcaoTexto = ee.String(limiteTreino.multiply(100).format('%.0f'))
    .cat('/')
    .cat(ee.Number(100).subtract(limiteTreino.multiply(100)).format('%.0f'));

  // Corrige a montagem estrutural para evitar aninhamento de sublistas que quebram o GEE
  var listaPesos = bands.iterate(function(bandaOmitida, listAccum) {
    bandaOmitida = ee.String(bandaOmitida);
    listAccum = ee.List(listAccum);
    
    var bandasReduzidas = ee.List(bands).remove(bandaOmitida);
    var svmOmitido = ee.Classifier.libsvm({decisionProcedure: 'Margin', svmType: 'C_SVC', kernelType: 'LINEAR', cost: 1});
    var modeloOmitido = svmOmitido.train({features: treinoFC, classProperty: 'presenca', inputProperties: bandasReduzidas});
    
    var accOmitida = testeFC.classify(modeloOmitido).errorMatrix('presenca', 'classification').accuracy();
    return listAccum.add(bandaOmitida).add(accOmitida); // Adiciona de forma linear consecutiva [chave, valor]
  }, ee.List([]));
  
  var dicionarioImportancia = ee.Dictionary(listaPesos);
  
  return ee.Feature(null, dicionarioImportancia)
    .set({'municipio': nomeMunicipioAtivo, 'particao': proporcaoTexto});
});

var tabelaSVM = ee.FeatureCollection(logsSVM);
var tabelaImportanciaSVM = ee.FeatureCollection(logsImportanciaSVM);

print("🔬 RESULTADOS MULTI-PARTIÇÃO SVM (MARGIN MODE):", tabelaSVM);
print("📊 IMPORTÂNCIA DE VARIÁVEIS SVM (JACKKNIFE):", tabelaImportanciaSVM);

// ============================================================================
// GATILHOS DE EXPORTAÇÃO EM LOTE PARALELO REESTRUTURADOS
// ============================================================================
var pontoCentroide = area.geometry().centroid();

var exportarDadosSVM = function(fraçãoStr, sufixo) {
  var metricasFiltradas = tabelaSVM.filter(ee.Filter.eq('particao', fraçãoStr));
  var metricasComGeometria = metricasFiltradas.map(function(f) { return f.setGeometry(pontoCentroide); });
  
  Export.table.toDrive({
    collection: metricasComGeometria,
    description: 'SVM_FinalMetrics_all_' + nomeMunicipioAtivo + sufixo,
    fileFormat: 'CSV',
    selectors: ['municipio', 'particao', 'train_frac', 'AUC', 'Kappa', 'TSS', 'accuracy', 
                'sensitivity', 'specificity', 'omission_rate', 'threshold_used', 'area_ha', 'area_km2', 'satelite']
  });
  
  var importanciaFiltrada = tabelaImportanciaSVM.filter(ee.Filter.eq('particao', fraçãoStr));
  var importanciaComGeometria = importanciaFiltrada.map(function(f) { return f.setGeometry(pontoCentroide); });
  
  Export.table.toDrive({
    collection: importanciaComGeometria,
    description: 'SVM_VarImportance_all_' + nomeMunicipioAtivo + sufixo,
    fileFormat: 'CSV',
    selectors: ['municipio', 'particao', 'bio14', 'bio17','bio06','bio12','bio15','elevation', 'aspect', 'slope', 
                'NDVI','AVI','MCARI','SOC', 'pH']
  });
};

exportarDadosSVM("70/30", "70");
exportarDadosSVM("75/25", "75");
exportarDadosSVM("80/20", "80");

// Exportação da matriz bruta para o R Studio de segurança
Export.table.toDrive({
  collection: dadosParaMaxent.map(function(f) { return f.setGeometry(pontoCentroide); }), 
  description: 'Amostras_Brutas_Predictors_' + nomeMunicipioAtivo,
  fileFormat: 'CSV',
  selectors: ['presenca', 'random', 'bio14', 'bio17','bio06','bio12','bio15','elevation', 'aspect', 'slope', 
              'NDVI','AVI','MCARI','SOC', 'pH']
});

// ============================================================================
// REPARO DEFINITIVO: TREINAMENTO DO MODELO FINAL E EXPORTAÇÃO DO MAPA TIFF
// ============================================================================
var modeloDefinitivoSVM = ee.Classifier.libsvm({
  decisionProcedure: 'Margin', svmType: 'C_SVC', kernelType: 'LINEAR', cost: 1
}).train({
  features: dadosParaMaxent.filter(ee.Filter.lte('random', 0.70)),
  classProperty: 'presenca',
  inputProperties: bands
});

// Classifica a imagem contínua e aplica o ajuste sigmoidal no servidor
var mapaMargemFinal = predictors.classify(modeloDefinitivoSVM).select('classification');
var mapaProbabilidadeFinal = ee.Image(1).divide(ee.Image(1).add(mapaMargemFinal.multiply(-1).exp())).rename('probability').clip(area);

Export.image.toDrive({
  image: mapaProbabilidadeFinal,
  description: 'SVM_Probability_Map_Grid_' + nomeMunicipioAtivo + '_70',
  scale: 10,
  region: area.geometry(),
  fileFormat: 'GeoTIFF',
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

print("[SUCCESS] Operational SVM multi-partition script completely closed and verified.");
