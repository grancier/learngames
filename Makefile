.PHONY: build typecheck test test-coverage lint harness verify

typecheck:
	pnpm typecheck

build:
	pnpm build

test:
	pnpm test

test-coverage:
	pnpm test:coverage

lint:
	pnpm lint

harness:
	pnpm harness

verify: typecheck build test test-coverage lint harness
