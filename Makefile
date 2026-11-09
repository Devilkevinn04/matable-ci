.DEFAULT_GOAL := help
.PHONY: help check production-status production-approve

export VERSION

help:
	@printf '%s\n' 'make check                            Vérifier et compiler en local' \
	  'make production-status                Voir le déploiement depuis le VPS' \
	  'make production-approve VERSION=SHA   Autoriser une révision depuis le VPS'

check:
	npm run lint
	npm run test:ci
	npm run build

production-status:
	systemctl list-timers matable-auto-deploy.timer --no-pager
	docker inspect matable-web --format '{{.Config.Image}} {{.State.Health.Status}}'
	journalctl -u matable-auto-deploy.service -n 12 --no-pager -o cat

production-approve:
	/usr/local/sbin/matable-auto-deploy --approve "$$VERSION"
