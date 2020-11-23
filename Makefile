ROOT_DIR := $(shell pwd)
BUILD_DIR := $(ROOT_DIR)/build
VERSION := $(shell grep '"version":' $(ROOT_DIR)/manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')
DATE := $(shell date '+%Y%m%d-%H%M%S')
BUNDLE_FILE_NAME := bitbucket-pr-commit-msg-$(VERSION).zip
BUNDLE_FILE_PATH := $(BUILD_DIR)/$(BUNDLE_FILE_NAME)
BIN_DIR := node_modules/.bin
ESLINT := $(BIN_DIR)/eslint

.PHONY: bundle clean lint test

bundle: lint $(BUNDLE_FILE_PATH)

clean:
	rm -rf $(BUILD_DIR)

lint: $(ESLINT)
	$(ESLINT) src/

test: lint
	# open $(ROOT_DIR)/tests/index.html

$(BUNDLE_FILE_PATH):
	mkdir -p $(BUILD_DIR)
	zip -Z deflate -r $(BUNDLE_FILE_PATH) manifest.json src/*.js
	@echo Created bundle $(BUNDLE_FILE_PATH)

$(ESLINT):
	npm install
