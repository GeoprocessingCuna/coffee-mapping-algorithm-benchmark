/**
 * ============================================================================
 * Script: image_extraction.js
 * Description: Cloud-based geospatial pipeline to filter 2018 Sentinel-2 
 *              surface reflectance data, compute spectral vegetation indices (NDVI), 
 *              integrate edaphic/climatic/topographic predictors, and export 
 *              spatial matrices across 10 municipalities in Minas Gerais, Brazil.
 * Workflow Stage: Remote Sensing Cloud Processing & Feature Extraction
 * Framework: Google Earth Engine (GEE) JavaScript API
 * Author: Inácio Samuel Cuna
 * ============================================================================
 */
// --- 1) USER INPUT AND ASSET COUPLING --------------------------------------
var presenca = ee.FeatureCollection('');
var area     = ee.FeatureCollection('');

var startDate = '2018-01-01';
var nYears = 1; 
//print("[INFO] Static Background features size validation:", ausencia.size()); // Safe debug
print("[INFO] Presence field collection size:", presenca.size());

// Make core ee Date objects
startDate = ee.Date(startDate);
nYears = ee.Number(nYears);
var nMonths = nYears.multiply(12);

// FIX 1: Centraliza o mapa e aplica o zoom automático em Carmo da Cachoeira - MG
Map.centerObject(area, 11);

// Render area perimeter on canvas (Pinta apenas a linha do contorno vazada)
var Np = ee.Image().byte().paint({
  featureCollection: area, 
  color: 1, 
  width: 3
});
Map.addLayer(Np, {palette: 'FF0000'}, "Study Area Boundary (Carmo da Cachoeira)");

// FIX 2: Adiciona os pontos de presença de café acesos em verde para contraste
Map.addLayer(presenca, {color: '00FF00'}, "Coffee Presence Points");

// ============================================================================
// Section 3 - Predictive Variable Selection and Cloud Masking (SCL Engine)
// ============================================================================
var maskCloudsS2 = function(img) {
  var scl = img.select('SCL');
  
  // FIX: Inverse Cloud & Shadow Filtering (Protects high reflectance flowering/dense pixels)
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  
  var rfl = img.select(['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B11','B12']).divide(10000);
  var resampled = rfl.select(['B5', 'B6', 'B7', 'B8A', 'B11', 'B12']).resample('bilinear');
  
  return rfl.addBands(resampled, ['B5', 'B6', 'B7', 'B8A', 'B11', 'B12'], true)
            .updateMask(mask)
            .copyProperties(img, ['system:time_start']);
};

// Load S2 surface collection allowing 40% threshold for maximum seasonal data
var s2Col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(area)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .map(maskCloudsS2);
print(s2Col);
// ============================================================================
// FIX INTEGRAL: INTRA-ANNUAL PROGRAMMATIC QUARTERLY COMPOSITES
// ============================================================================
print("[INFO] Initializing fixed quarterly seasonal composite engine...");

// Cria os gatilhos matemáticos para os meses exatos de início civil: 0 (Jan), 3 (Abr), 6 (Jul), 9 (Out)
var seq = ee.List([0, 3, 6, 9]);

var compList = seq.map(function(startMonth){
  startMonth = ee.Number(startMonth);
  
  // Define o início e o fim exato de cada trimestre dentro do ano ativo (2018)
  var t1 = startDate.advance(startMonth, 'month');
  var t2 = t1.advance(3, 'month');
  
  // Realiza a fusão de pixels estáveis limpos pelo SCL dentro da janela fina
  var imgMed = s2Col.filterDate(t1, t2).median();
  var nBands = imgMed.bandNames().size();
  
  return imgMed.set({
    'system:time_start': t1.millis(),
    'nBands': nBands
  });
});

// Transforma de volta em coleção e expurga matrizes vazias reais
var compCol = ee.ImageCollection.fromImages(compList)
                .filter(ee.Filter.gt('nBands', 0));

// Flatten the filtered non-empty composites back to a baseline single image
var image = compCol.median().select(['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B11','B12']);

// Sample baseline spectral reflectance values at presence point locations
var sampleP = image.sampleRegions({
  collection: presenca, 
  scale: 10,
  geometries: true
});

// Load external environmental grids (WorldClim BIO + Elevation)
var BIO = ee.Image("WORLDCLIM/V1/BIO");
var srtm = ee.Image("USGS/SRTMGL1_003");
var terrain = ee.Algorithms.Terrain(srtm);
var slope = terrain.select('slope');

var flow = srtm.focal_mean(3).rename('flow');  
var tanSlope = slope.multiply(Math.PI).divide(180).tan();
var twi = flow.divide(tanSlope).log().rename('TWI');

// Compute advanced spectral vegetation indices
var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');

var evi = image.expression(
  '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
  { NIR: image.select('B8'), RED: image.select('B4'), BLUE: image.select('B2') }
).rename('EVI');

var gndvi = image.expression(
  '((NIR - GREEN) / (NIR + GREEN))',
  { NIR: image.select('B8'), GREEN: image.select('B3') }
).rename('GNDVI');

var savi = image.expression(
  '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
  { NIR: image.select('B8'), RED: image.select('B4'), L: 0.5 }
).rename('SAVI');

var ndre = image.normalizedDifference(['B8', 'B5']).rename('NDRE');

var msavi = image.expression(
  '((2 * NIR + 1) - sqrt((2 * NIR + 1)**2 - 8 * (NIR - RED))) / 2',
  { NIR: image.select('B8'), RED: image.select('B4') }
).rename('MSAVI');

var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');

var avi = image.expression('(NIR + RED) * (NIR - RED)', { NIR: image.select('B8'), RED: image.select('B4') }).rename('AVI');
var mcari = image.expression('((RE - RED) - 0.2 * (RE - GREEN)) * (RE / RED)', { RE: image.select('B5'), RED: image.select('B4'), GREEN: image.select('B3') }).rename('MCARI');
var gli = image.expression('(2 * GREEN - RED - BLUE) / (2 * GREEN + RED + BLUE)', { GREEN: image.select('B3'), RED: image.select('B4'), BLUE: image.select('B2') }).rename('GLI');
var sr = image.expression('NIR / RED', { NIR: image.select('B8'), RED: image.select('B4') }).rename('SR');

// Load native multi-band OpenLandMap verified soil datasets (pH and SOC)
print("[INFO] Processing verified OpenLandMap soil layers using band reduction...");

var socImage = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02");
var phImage  = ee.Image("OpenLandMap/SOL/SOL_PH-H2O_USDA-4C1A2A_M/v02");

// 1. Reduz as 6 bandas de profundidade para 1 única banda média para cada atributo
var socMean = socImage.select(['b0', 'b10', 'b30']).reduce(ee.Reducer.mean()).rename('SOC');
var phMean  = phImage.select(['b0', 'b10', 'b30']).reduce(ee.Reducer.mean()).multiply(0.1).rename('pH');

// 2. Junta as duas bandas médias unificadas em uma única imagem de solo (2 bandas)
var soloBruto = ee.Image.cat([socMean, phMean]);

// 3. O SEGREDO DO PARSE: Cria uma máscara de 1 única banda combinando os filtros lógicos maiores que zero
// Isso remove os falsos zeros da água e do efeito de borda de forma cirúrgica
var filtroZero = socMean.gt(0).and(phMean.gt(0));

// 4. Aplica a interpolação e a máscara lógica de banda única sem conflito no servidor
var soilPredictors = soloBruto
  .resample('bilinear')       // Interpola suavemente de 250m para 10m
  .updateMask(filtroZero);    // Corta e elimina todo valor igual a zero

print("[SUCESSO] Solo corrigido! Amostragem de banda única alinhada e livre de erros.");
// Master stack coupling
var predictors = BIO
  .addBands(image) 
  .addBands(terrain)
  .addBands(ndvi)
  .addBands(evi)
  .addBands(gndvi)
  .addBands(ndre)
  .addBands(msavi)
  .addBands(ndwi)
  .addBands(avi)
  .addBands(mcari)
  .addBands(gli)
  .addBands(sr)
  .addBands(savi)
  .addBands(twi)
  .addBands(soilPredictors);

var bands = [
  'bio01', 'bio02', 'bio03', 'bio04', 'bio05', 'bio06', 'bio07', 'bio08', 'bio09', 'bio10',  
  'bio11', 'bio12', 'bio13', 'bio14', 'bio15', 'bio16', 'bio17', 'bio18', 'bio19',
  'elevation', 'aspect', 'slope', 'hillshade', 'TWI',
  'GNDVI', 'NDVI', 'EVI', 'SAVI', 'SR', 'GLI', 'MCARI', 'AVI', 'NDWI', 'MSAVI', 'NDRE',
  'SOC', 'pH'
];

predictors = predictors.select(bands);
print('[INFO] Final active bands inside predictors:', predictors.bandNames());

// Extract predictor values for Pearson analysis matrix layout
var DataCor = predictors.sampleRegions({
  collection: sampleP,
  properties: ['presenca'],
  scale: 10,
  geometries: false
});

// Export the extracted feature matrix data directly to Google Drive
Export.table.toDrive({
  collection: DataCor,
  description: 'DataCor_Sentinel_Predictors_Extraction_Matrix',
  fileFormat: 'CSV'
});

print("[SUCCESS] GEE asset extraction workflow completely compiled and ready to run.");
