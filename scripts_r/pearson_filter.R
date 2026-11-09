# ==============================================================================
# Script: pearson_filter.R
# Description: Multicollinearity filtering using Pearson correlation matrix 
#              at |r| < 0.70 for multi-source environmental and spectral predictors.
# Author: Inácio Samuel Cuna
# Project: Benchmarking Machine Learning Models for Crop Mapping
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Required Packages
# ------------------------------------------------------------------------------
library(tidyverse)
library(ggcorrplot)
library(patchwork)
library(ggplot2)

# ------------------------------------------------------------------------------
----------------------------------------------------------------------------
# 2. Import Data
# ------------------------------------------------------------------------------
data <- read.csv("")

# ------------------------------------------------------------------------------
# 3. Define Predictor Variable Groups
# ------------------------------------------------------------------------------
bioclim  <- data %>% select(starts_with("bio"))
terrain  <- data %>% select("elevation", "slope", "aspect", "hillshade")
spectral <- data %>% select("AVI", "EVI", "GLI", "GNDVI", "MCARI", "MSAVI",
                            "NDRE", "NDVI", "NDWI", "SAVI", "SR", "TWI")
soil     <- data %>% select("SOC", "pH")

# ------------------------------------------------------------------------------
# 4. Filter and Select Non-Multicollinear Subsets (Pearson threshold < 0.70)
# ------------------------------------------------------------------------------
bio_keep      <- c("bio03", "bio19")
terrain_keep  <- c("slope", "aspect", "hillshade", "elevation")
spectral_keep <- c("NDVI")
soil_keep     <- c("SOC", "pH")

bioclim_sel  <- data %>% select(all_of(bio_keep))
terrain_sel  <- data %>% select(all_of(terrain_keep))
spectral_sel <- data %>% select(all_of(spectral_keep))
soil_sel     <- data %>% select(all_of(soil_keep))

# ------------------------------------------------------------------------------
# 5. Function to Generate Consistent Correlograms
# ------------------------------------------------------------------------------
show_corr_group_gg <- function(df) {
  # Ensures only numeric variables are used
  df <- df %>% select(where(is.numeric))
  
  # Computes Pearson correlation matrix with pairwise complete observations
  corr_mat <- cor(df, method = "pearson", use = "pairwise.complete.obs")
  
  # Generates the correlation plot
  ggcorrplot(
    corr_mat,
    hc.order = TRUE,
    type = "upper",
    lab = TRUE,
    lab_size = 2.5,
    show.legend = TRUE,
    colors = c("blue", "white", "red")
  ) +
    scale_fill_gradient2(
      low = "blue",
      mid = "white",
      high = "red",
      midpoint = 0,
      limits = c(-1, 1),
      name = "Pearson r"
    ) +
    theme_minimal(base_size = 8) +
    theme(
      axis.text.x = element_text(angle = 45, vjust = 1, hjust = 1),
      legend.title = element_text(size = 7),
      legend.text = element_text(size = 6),
      plot.title = element_blank()
    )
}

# ------------------------------------------------------------------------------
# 6. Generate Individual Group Charts
# ------------------------------------------------------------------------------
p_bioclim  <- show_corr_group_gg(bioclim)
p_terrain  <- show_corr_group_gg(terrain)
p_spectral <- show_corr_group_gg(spectral)
p_soil     <- show_corr_group_gg(soil)

p_bioclim_sel  <- show_corr_group_gg(bioclim_sel)
p_terrain_sel  <- show_corr_group_gg(terrain_sel)
p_spectral_sel <- show_corr_group_gg(spectral_sel)
p_soil_sel     <- show_corr_group_gg(soil_sel)

# ------------------------------------------------------------------------------
# 7. Combine Group Charts Into a Multi-Panel Layout
# ------------------------------------------------------------------------------
final_panel <- (
  (p_bioclim + p_terrain + p_spectral + p_soil + plot_layout(widths = c(1.6, 0.6, 1, 0.4))) /
    (p_bioclim_sel + p_terrain_sel + p_spectral_sel + p_soil_sel + plot_layout(widths = c(1.6, 0.6, 1, 0.4)))
) +
  plot_layout(guides = "collect") +  # Unified unique legend
  plot_annotation(
    title = "",
    theme = theme(plot.title = element_blank())
  ) &
  theme(legend.position = "bottom")

# ------------------------------------------------------------------------------
# 8. Export Multi-Panel Layout (Uncomment to execute locally)
# ------------------------------------------------------------------------------
# output_panel_path <- "scripts_r/outputs/Correlogramas_Grupos_Painel.pdf"
# ggsave(
#   filename = output_panel_path,
#   plot = final_panel,
#   device = cairo_pdf,
#   width = 12,
#   height = 8,
#   units = "in",
#   dpi = 300
# )

# ------------------------------------------------------------------------------
# 9. Generate Master Unified Correlogram of All Purified Predictors
# ------------------------------------------------------------------------------
# Unifies all selected variable blocks filtered by the 0.7 Pearson threshold
master_selected_data <- data %>% 
  select(all_of(bio_keep), all_of(terrain_keep), all_of(spectral_keep), all_of(soil_keep))

# Calculates final integrated correlation matrix
master_corr_matrix <- cor(master_selected_data, method = "pearson", use = "pairwise.complete.obs")

# Generate the master unified visual matrix canvas
p_master_unified <- ggcorrplot(
  master_corr_matrix,
  hc.order = TRUE,
  type = "upper",
  lab = TRUE,
  lab_size = 2.5,
  show.legend = TRUE,
  colors = c("#0055ff", "#ffffff", "#ff2200")
) +
  scale_fill_gradient2(
    low = "#0055ff", mid = "#ffffff", high = "#ff2200",
    midpoint = 0, limits = c(-1, 1), name = "Pearson correlation (r)"
  ) +
  labs(title = "Master Purified Correlogram - Unified Environmental Predictors") +
  theme_minimal(base_size = 9) +
  theme(
    plot.title = element_text(face = "bold", size = 10, hjust = 0.5),
    axis.text.x = element_text(angle = 45, vjust = 1, hjust = 1, size = 7),
    axis.text.y = element_text(size = 7),
    legend.position = "right",
    legend.title = element_text(size = 8, face = "bold"),
    legend.text = element_text(size = 7)
  )

# Export the master unified correlogram as an independent high-resolution file
# output_master_path <- "scripts_r/outputs/Predictor_Master_Unified_Correlogram_300dpi.png"
# ggsave(output_master_path, plot = p_master_unified, width = 22, height = 18, units = "cm", dpi = 300)

cat("[SUCCESS] Pearson correlation matrix processing compiled successfully.\n")
