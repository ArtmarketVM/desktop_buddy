# A release must not inherit the build machine's AVX/ARM instruction set.
set(GGML_NATIVE OFF CACHE BOOL "Portable speech CPU backend" FORCE)
set(GGML_AVX OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_AVX2 OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_AVX512 OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_FMA OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_F16C OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_SSE42 OFF CACHE BOOL "Baseline x64 support" FORCE)
set(GGML_BMI2 OFF CACHE BOOL "Baseline x64 support" FORCE)
