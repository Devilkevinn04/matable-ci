.DEFAULT_GOAL := help
.PHONY: help check production-status

help:
	@printf '%s\n' 'make check                            Vérifier et compiler en local' \
	  'make production-status                Voir le déploiement depuis le VPS'

check:
	npm run lint
	npm run test:ci
	python3 -m unittest discover -s tests -p 'test_*.py'
	npm run build

production-status:
	systemctl list-timers matable-auto-deploy.timer --no-pager
	docker inspect matable-web --format '{{.Config.Image}} {{.State.Health.Status}}'
	journalctl -u matable-auto-deploy.service -n 12 --no-pager -o cat
