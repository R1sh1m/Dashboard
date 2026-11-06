cmake_minimum_required(VERSION 3.16)

if(NOT DEFINED ENV{IDF_PATH})
	message(FATAL_ERROR "IDF_PATH is not set. Set it to the ESP-IDF installation directory.")
endif()

file(TO_CMAKE_PATH "$ENV{IDF_PATH}" IDF_PATH)
include("${IDF_PATH}/tools/cmake/project.cmake")
project(esp_receiver)
