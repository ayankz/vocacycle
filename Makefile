COSYVOICE_DIR ?= $(CURDIR)/../cosyvoice-test/CosyVoice
STORAGE_DIR ?= $(CURDIR)/storage/audio
COSYVOICE_PYTHON ?= $(COSYVOICE_DIR)/../.venv/bin/python

.DEFAULT_GOAL := help
.PHONY: db-up db-down db-status db-shell

help:
	@echo "VocaCycle commands:"
	@echo "  make api         Start ASP.NET Core API"
	@echo "  make worker      Start .NET Worker"
	@echo "  make redis-up    Start Redis Docker container"
	@echo "  make redis-down  Stop Redis Docker container"
	@echo "  make redis-logs  Show Redis logs"
	@echo "  make tts         Start CosyVoice FastAPI"
	@echo "  make build       Build .NET solution"
	@echo "  make db-up       Start PostgreSQL"
	@echo "  make db-down     Stop PostgreSQL"
	@echo "  make db-status   Show Homebrew services"
	@echo "  make db-shell    Open PostgreSQL CLI"

api:
	dotnet run --project apps/api/VocaCycle.Api.csproj --urls "http://0.0.0.0:5126"
worker:
	VOCACYCLE_STORAGE="$(STORAGE_DIR)" dotnet run --project apps/worker/VocaCycle.Worker.csproj

redis-up:
	docker start vocacycle-redis

redis-down:
	docker stop vocacycle-redis

redis-logs:
	docker logs -f vocacycle-redis
tts:
	cd "$(COSYVOICE_DIR)" && "$(COSYVOICE_PYTHON)" -m uvicorn main:app \
		--app-dir "$(CURDIR)/apps/tts" \
		--host 127.0.0.1 \
		--port 8001

build:
	dotnet build VocaCycle.slnx
db-up:
	brew services start postgresql@18

db-down:
	brew services stop postgresql@18

db-status:
	brew services list

db-shell:
	psql -d vocacycle