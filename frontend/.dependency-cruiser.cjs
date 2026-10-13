/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "해석할 수 없는 모듈 import는 금지됩니다.",
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "순환 의존성은 허용되지 않습니다.",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "api-only-depends-on-api",
      severity: "error",
      comment:
        "src/api는 프로젝트 내부에서 src/api 외의 모듈(UI, validation, 배럴 파일 등)을 참조할 수 없습니다.",
      from: {
        path: "^src/api",
      },
      to: {
        path: "^src/",
        pathNot: "^src/api",
      },
    },
    {
      name: "no-api-to-ui",
      severity: "error",
      comment: "src/api에서 src/ui로의 직접 또는 간접 역참조는 금지됩니다.",
      from: {
        path: "^src/api",
      },
      to: {
        path: "^src/ui",
      },
    },
    {
      name: "no-validation-to-ui",
      severity: "error",
      comment: "src/validation은 src/ui를 참조할 수 없습니다.",
      from: {
        path: "^src/validation",
      },
      to: {
        path: "^src/ui",
      },
    },
    {
      name: "no-outside-frontend",
      severity: "error",
      comment: "frontend 외부 백엔드 코드나 루트 경로 참조는 금지됩니다.",
      from: {
        path: "^src",
      },
      to: {
        path: "(^\\.\\.)|(com/mirinae/market)",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
