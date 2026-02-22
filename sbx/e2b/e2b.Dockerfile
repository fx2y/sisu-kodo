FROM e2bdev/code-interpreter:latest

WORKDIR /workspace

# Keep the template lean and deterministic; app deps are keyed by depsHash.
RUN npm i -g pnpm@10

CMD ["bash", "-lc", "node -v && pnpm -v && echo sbx-template-ready"]

