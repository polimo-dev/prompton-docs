DOCS_URL ?= https://docs.prompton.ai
APP_URL ?= https://app.prompton.ai
HOME_URL ?= https://prompton.ai
TAG ?= prompton-docs:local
PORT ?= 8090

.PHONY: install build serve docker run
install:
	npm ci --no-audit --no-fund
build:
	DOCS_URL=$(DOCS_URL) APP_URL=$(APP_URL) HOME_URL=$(HOME_URL) node build.mjs
serve: build
	PORT=$(PORT) node serve.mjs
docker:
	docker build --build-arg DOCS_URL=$(DOCS_URL) --build-arg APP_URL=$(APP_URL) --build-arg HOME_URL=$(HOME_URL) -t $(TAG) .
run:
	docker run --rm -p $(PORT):8080 $(TAG)
