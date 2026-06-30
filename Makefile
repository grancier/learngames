.PHONY: build typecheck test lint verify

typecheck:
	pnpm typecheck

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

verify: typecheck build test
