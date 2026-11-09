# ==============================================================================
# PROJECT: COFFEE SPATIAL MAPPING & REGIONAL MACHINE LEARNING
# STEP 06: Final Master Data Integration Engine & 3x3 Premium Trajectory Matrix
# AUTHOR: Inácio Samuel Cuna | UFLA
# ==============================================================================

# --- 1. LOAD REQUIRED LIBRARIES -----------------------------------------------
library(tidyverse)
library(ggplot2)
library(gridExtra)
library(grid)

# --- 2. SET RELATIVE PATHWAYS AND TARGET INGESTION FOLDER --------------------
# Configured with relative paths directly inside the repository workspace
pasta_unica <- "data_sample"

cat("[INFO] Initializing final 12-column master data integration engine (Hectares)...\n")

# --- 3. DETECTING ALL TARGET FILES (EXCLUDING PATROCINIO NATIVELY) ------------
lista_maxent <- list.files(path = pasta_unica, pattern = "MaxEnt_FinalMetrics_all_.*\\.csv$", full.names = TRUE)
lista_rf     <- list.files(path = pasta_unica, pattern = "RF_FinalMetrics_all_.*\\.csv$", full.names = TRUE)
lista_svm    <- list.files(path = pasta_unica, pattern = "SVM_FinalMetrics_all_.*\\.csv$", full.names = TRUE)

print(paste("➜ CSVs do MaxEnt detectados:", length(lista_maxent)))
print(paste("➜ Random Forest detectados:", length(lista_rf)))
print(paste("➜ CSVs do SVM detectados:", length(lista_svm)))

# --- 4. FUNÇÃO ROBUSTA DE PADRONIZAÇÃO GEOGRÁFICA VIA FILENAME ----------------
extrair_dados_do_nome <- function(caminho_arquivo, prefixo_remover) {
  base_name <- basename(caminho_arquivo) %>% str_to_lower()
  num_part <- str_extract(base_name, "\\d+")
  
  nome_limpo <- base_name %>% 
    str_remove(str_to_lower(prefixo_remover)) %>% 
    str_remove("\\.csv") %>% 
    str_remove_all("\\d+") %>% 
    str_replace_all("á|ã|â|à", "a") %>% 
    str_replace_all("é|ê|è", "e") %>% 
    str_replace_all("í|î|ì", "i") %>% 
    str_replace_all("ó|õ|ô|ò", "o") %>% 
    str_replace_all("ú|û|ù", "u") %>% 
    str_remove_all("\\s+")
  
  municipio_formatado <- case_when(
    nome_limpo == "canaverde"                    ~ "Cana Verde",
    str_detect(nome_limpo, "carmo")              ~ "Carmo da Cachoeira",
    str_detect(nome_limpo, "ijaci")              ~ "Ijaci",
    str_detect(nome_limpo, "ingai")              ~ "Ingaí",
    str_detect(nome_limpo, "itumirim")          ~ "Itumirim",
    str_detect(nome_limpo, "lavras")            ~ "Lavras",
    str_detect(nome_limpo, "ribeirao")          ~ "Ribeirão Vermelho",
    str_detect(nome_limpo, "sao bento|saobento") ~ "São Bento Abade",
    str_detect(nome_limpo, "luminarias")        ~ "Luminárias",
    str_detect(nome_limpo, "nepomuceno")        ~ "Nepomuceno",
    TRUE                                         ~ str_to_title(nome_limpo)
  )
  
  particao_formatada <- case_when(
    num_part %in% c("70", "30") ~ "70/30",
    num_part == "75"            ~ "75/25",
    num_part == "80"            ~ "80/20",
    TRUE                        ~ "70/30"
  )
  
  return(list(municipio = municipio_formatado, particao = particao_formatada))
}

# ==============================================================================
# PART B: PARSING AND HARMONIZING INDIVIDUAL PIPELINES WITH HECTARES (area_ha)
# ==============================================================================
cat("[INFO] Compiling individual model data frames including hectares...\n")

df_maxent_mestre <- lista_maxent %>% map_df(function(arq) {
  df <- read.csv(arq)
  metadados <- extrair_dados_do_nome(arq, "MaxEnt_FinalMetrics_all_")
  df %>% mutate(
    municipio_fix = metadados$municipio,
    particao_fix  = metadados$particao,
    Algorithm     = "MaxEnt"
  ) %>% select(Algorithm, municipio_fix, particao_fix, AUC, Kappa, accuracy, sensitivity, specificity, omission_rate, threshold_used, area_ha, satelite)
})

df_rf_mestre <- lista_rf %>% map_df(function(arq) {
  df <- read.csv(arq)
  metadados <- extrair_dados_do_nome(arq, "RF_FinalMetrics_all_")
  df %>% mutate(
    municipio_fix = metadados$municipio,
    particao_fix  = metadados$particao,
    Algorithm     = "Random Forest"
  ) %>% select(Algorithm, municipio_fix, particao_fix, AUC, Kappa, accuracy, sensitivity, specificity, omission_rate, threshold_used, area_ha, satelite)
})

df_svm_mestre <- lista_svm %>% map_df(function(arq) {
  df <- read.csv(arq)
  metadados <- extrair_dados_do_nome(arq, "SVM_FinalMetrics_all_")
  df %>% mutate(
    municipio_fix = metadados$municipio,
    particao_fix  = metadados$particao,
    Algorithm     = "Support Vector Machine"
  ) %>% select(Algorithm, municipio_fix, particao_fix, AUC, Kappa, accuracy, sensitivity, specificity, omission_rate, threshold_used, area_ha, satelite)
})

# ==============================================================================
# PART C: CONSOLIDAÇÃO E ORDENAÇÃO RÍGIDA DA MATRIZ PURIFICADA
# ==============================================================================
cat("[INFO] Executing matrix binding and strict hierarchical sorting...\n")

tabela_mestre_purificada <- bind_rows(df_maxent_mestre, df_rf_mestre, df_svm_mestre) %>%
  filter(!is.na(AUC)) %>%
  filter(municipio_fix != "Patrocínio") %>%
  mutate(algorithm = Algorithm) %>%
  rename(
    Algoritmo = algorithm, Municipio = municipio_fix, Particao = particao_fix,
    Acuracia = accuracy, Sensibilidade = sensitivity, Especificidade = specificity, 
    Taxa_Omissao = omission_rate, Limiar = threshold_used, Area_ha = area_ha, Satelite = satelite
  ) %>%
  select(Algoritmo, Municipio, Particao, AUC, Kappa, Acuracia, Sensibilidade, Especificidade, Taxa_Omissao, Limiar, Area_ha, Satelite) %>%
  arrange(Municipio, factor(Particao, levels = c("70/30", "75/25", "80/20")), Algoritmo) %>%
  distinct(Algoritmo, Municipio, Particao, .keep_all = TRUE)

# ==============================================================================
# PART D: GRAVAÇÃO DA PLANILHA MATRIZ NO DISCO COLETOR
# ==============================================================================
output_csv_mestre <- "data_sample/Metricas_Mestre_Consolidada_Purificada.csv"
write.csv(tabela_mestre_purificada, output_csv_mestre, row.names = FALSE)

# ==============================================================================
# STEP 07: MATRIZ DE GRÁFICOS DE LINHA PREMIUM — LAYOUT 3x3 (SEM OMISSÃO)
# ==============================================================================
cat("[INFO] Rendering final publication-grade multi-metric trajectory matrix (3x3)...\n")

df_long_3metrics <- tabela_mestre_purificada %>%
  select(Algoritmo, Municipio, Particao, AUC, Kappa, Acuracia) %>%
  pivot_longer(cols = c(AUC, Kappa, Acuracia), names_to = "Metrica", values_to = "Valor") %>%
  filter(!is.na(Valor)) %>%
  mutate(
    Municipio = factor(Municipio),
    Particao = factor(Particao, levels = c("70/30", "75/25", "80/20")),
    Algoritmo = factor(Algoritmo, levels = c("MaxEnt", "Random Forest", "Support Vector Machine")),
    Metrica = case_when(
      Metrica == "AUC"      ~ "AUC",
      Metrica == "Kappa"    ~ "Kappa (k)",
      Metrica == "Acuracia" ~ "Accuracy",
      TRUE                  ~ Metrica
    ),
    Metrica = factor(Metrica, levels = c("AUC", "Kappa (k)", "Accuracy"))
  ) %>%
  distinct(Algoritmo, Municipio, Particao, Metrica, .keep_all = TRUE)

nomes_curtos_municipios <- c(
  "São Bento Abade" = "SBA", "Ribeirão Vermelho" = "RV", "Nepomuceno" = "NEP", 
  "Luminárias" = "LUM", "Lavras" = "LAV", "Itumirim" = "ITU", 
  "Ingaí" = "ING", "Ijaci" = "IJA", "Carmo da Cachoeira" = "CAR", "Cana Verde" = "CAN"
)

df_long_3metrics$municipio_sigla <- factor(
  df_long_3metrics$Municipio, 
  levels = names(nomes_curtos_municipios), 
  labels = nomes_curtos_municipios
)

# ============================================================================
# RENDERING DA MATRIZ PREMIUM 3x3 (SÓ AUC, KAPPA E ACURÁCIA)
# ============================================================================
grafico_publicacao_3x3 <- ggplot(df_long_3metrics, aes(x = municipio_sigla, y = Valor, group = Particao, color = Particao)) +
  geom_line(linewidth = 0.75, alpha = 0.85) +
  geom_point(size = 2.5, shape = 21, fill = "white", stroke = 1.2) +
  
  # Força o layout em 3 linhas x 3 colunas de forma estrita
  facet_grid(Metrica ~ Algoritmo, scales = "free_y") +
  
  scale_color_manual(
    values = c("70/30" = "#4CAF50", "75/25" = "#00B5D8", "80/20" = "#E53E3E"),
    name = "Data Partition Split Ratio"
  ) +
  
  scale_y_continuous(limits = c(0, 1.03), expand = c(0.02, 0.02), breaks = seq(0, 1, 0.2)) +
  
  labs(
    x = "Municipalities",
    y = "Estimated Metric Value Score",
    title = "Predictive Performance Trajectory Matrix Across Regions",
    subtitle = "Faceted multi-criteria assessment validating model consistency across classifiers, splits, and territories"
  ) +
  
  theme_bw(base_size = 10) +
  theme(
    plot.title = element_text(face = "bold", size = 12, color = "#1A202C", hjust = 0.5),
    plot.subtitle = element_text(size = 9, color = "#4A5568", margin = margin(b = 15), hjust = 0.5),
    strip.background = element_rect(fill = "#2D3748", color = "#1A202C", linewidth = 0.8),
    strip.text = element_text(face = "bold", size = 9, color = "white"),
    axis.title = element_text(face = "bold", size = 9.5, color = "#2D3748"),
    axis.text.x = element_text(angle = 45, hjust = 1, vjust = 1, face = "bold", color = "#2D3748", size = 8.5),
    axis.text.y = element_text(color = "#2D3748", size = 8.5),
    panel.grid.major.y = element_line(color = "#CBD5E1", linewidth = 0.4, linetype = "dashed"),
    panel.grid.major.x = element_blank(),
    panel.grid.minor = element_blank(),
    panel.border = element_rect(color = "#94A3B8", linewidth = 0.8),
    panel.spacing = unit(0.7, "lines"),
    legend.position = "top",
    legend.direction = "horizontal",
    legend.title = element_text(face = "bold", size = 9, color = "#2D3748"),

legend.text = element_text(size = 8.5, color = "#2D3748"),
legend.box.spacing = unit(0.4, "cm")
)
print(grafico_publicacao_3x3)

Salva a matriz limpa cravada em formato 3x3 nas pastas do repositório

ggsave(filename = "data_sample/outputs/Figure_2_Performance_Metrics_Matrix.png", plot = grafico_publicacao_3x3, width = 11, height = 8.5, dpi = 300)
ggsave(filename = "data_sample/outputs/Figure_2_Performance_Metrics_Matrix.pdf", plot = grafico_publicacao_3x3, width = 11, height = 8.5, device = "pdf")

------------------------------------------------------------------------------


--- 8. DOCUMENT GENERATION: HIGH-RESOLUTION VECTOR TABLE PDF ----------------


------------------------------------------------------------------------------

cat("[INFO] Flushed old device canvas connections from memory allocation loops...\n")
while (!is.null(dev.list())) dev.off()
cat("[INFO] Deploying fixed PDF matrix compiler engine...\n")
tabela_impressa <- tabela_mestre_purificada %>%
mutate(across(c(AUC, Kappa, Acuracia, Sensibilidade, Especificidade, Taxa_Omissao), ~ round(., 3))) %>%
mutate(Limiar = round(Limiar, 2)) %>%
mutate(Area_ha = round(Area_ha, 0)) %>%
select(-Satelite)
tema_tabela_pdf <- gridExtra::ttheme_default(
core = list(fg_params = list(fontsize = 6.5, fontface = "plain"), bg_params = list(fill = c("white", "grey97"))),
colhead = list(fg_params = list(fontsize = 7.5, fontface = "bold", col = "white"), bg_params = list(fill = "#2d3748")),
rowhead = list(fg_params = list(fontsize = 6, fontface = "italic"))
)
linhas_pagina <- 90
arquivo_pdf_tabela <- "data_sample/outputs/Tabela_Mestre_Metricas_Purificadas.pdf"
pdf(arquivo_pdf_tabela, width = 21, height = 29.7)
for(pagina in 1:1) {
idx_start <- ((pagina - 1) * linhas_pagina) + 1
idx_end   = min(pagina * lines_pagina, nrow(tabela_impressa))
fatia_tabela <- tabela_impressa[idx_start:idx_end, ]
grid.draw(tableGrob(fatia_tabela, theme = tema_tabela_pdf, rows = NULL))
}
dev.off()
cat("\n=================================================================\n")
cat(" [SUCESSO] Matriz 3x3 limpa gerada (Apenas AUC, Kappa e Accuracy) \n")
cat("=================================================================\n")
