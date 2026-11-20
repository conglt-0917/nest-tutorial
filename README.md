## Description

Nest Tutorial

## Project setup

```bash
$ pnpm install
```

## Database, Redis & migrations

PostgreSQL and Redis run via Docker Compose (it reads `.env`, see `.env.example`):

```bash
$ docker compose up -d
```

The schema is managed only by hand-written TypeORM migrations in `src/database/migrations/` (`synchronize` is off). The CLI runs against the compiled `dist/`, so each script builds first.

```bash
# scaffold an empty migration, then write the up/down SQL by hand
$ pnpm migration:create src/database/migrations/AddSomethingToUsers

$ pnpm migration:show     # list applied / pending migrations
$ pnpm migration:run      # apply pending migrations
$ pnpm migration:revert   # roll back the last migration
```

## Authentication

| Method | Path             | Auth   | Body                        |
| ------ | ---------------- | ------ | --------------------------- |
| POST   | `/auth/register` | public | `{ email, password, name }` |
| POST   | `/auth/login`    | public | `{ email, password }`       |
| POST   | `/auth/refresh`  | public | `{ refreshToken }`          |
| POST   | `/auth/logout`   | Bearer | `{ refreshToken }`          |
| GET    | `/users/me`      | Bearer | -                           |

Login returns `{ accessToken, refreshToken }` (JWTs with separate secrets). Every route requires a Bearer access token unless it is marked `@Public()`. Logout, and each refresh (rotation), revoke the token's `jti` by storing it in Redis (`auth:blacklist:<jti>`) with a TTL equal to the token's remaining lifetime.

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests (need `docker compose up -d` and `pnpm migration:run`)
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Sun Lint

### Basic usage

```bash
# Run all rules on src directory
sunlint --all --input=src
```

```bash
# Check specific rules, language rules
sunlint --rules=C019,S005 --input=src
sunlint --specific --languages=dart --input=lib
```

```bash
# Security-focused scan
sunlint --security --input=src
```

### Advanced usage

```bash
# ESLint integration
sunlint --all --eslint-integration --input=src
```

```bash
# Git integration
sunlint --all --changed-files
```

```bash
# CI/CD mode
sunlint --all --pr-mode --fail-on-new-violations
```

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
