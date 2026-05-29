# Project: My-Link

이 프로젝트는 `my-profile`이라는 Next.js 애플리케이션을 포함하고 있는 개인 프로필/링크 관리 서비스 프로젝트입니다.

## 🚀 프로젝트 개요
- **주요 목적:** 사용자의 프로필 및 링크 정보를 관리하고 보여주는 웹 서비스
- **핵심 기술 스택:**
  - **Framework:** Next.js (App Router)
  - **Library:** React 19
  - **Language:** TypeScript
  - **Styling:** Tailwind CSS 4
- **주요 구조:**
  - `/my-profile`: 실제 Next.js 프로젝트 소스 코드가 포함된 디렉토리
  - `/my-profile/app`: App Router 기반의 페이지 및 레이아웃 정의
  - `/my-profile/public`: 정적 자원 (이미지, 아이콘 등)

## 🛠 빌드 및 실행 가이드
모든 명령어는 `my-profile` 디렉토리 내부에서 실행해야 합니다.

### 개발 서버 실행
```bash
cd my-profile
npm run dev
```

### 프로젝트 빌드
```bash
cd my-profile
npm run build
```

### 린트 체크
```bash
cd my-profile
npm run lint
```

## 📝 개발 컨벤션 및 참고 사항
- **Next.js 버전 주의:** `AGENTS.md`에 명시된 바와 같이, 현재 사용 중인 Next.js 버전은 기존의 관습과 다른 브레이킹 체인지가 있을 수 있으므로 공식 문서나 `node_modules/next/dist/docs/`를 참고해야 합니다.
- **컴포넌트 구조:** App Router 방식을 따르며, `app` 디렉토리 내에 페이지 단위로 구성합니다.
- **스타일링:** Tailwind CSS 4를 사용하여 유틸리티 퍼스트 방식으로 스타일을 적용합니다.
- **코드 품질:** ESLint 설정에 따라 코드 품질을 유지하며, 커밋 전 린트 체크를 권장합니다.

## 🤖 에이전트 지침 (Context)
- 개발 작업 시 항상 `my-profile` 디렉토리로 이동하여 작업을 수행하십시오.
- 새로운 기능을 추가하거나 버그를 수정할 때는 관련 테스트 케이스를 확인하거나 추가하십시오.
- 기술 스택의 최신 버전(React 19, Tailwind 4 등) 특성을 고려하여 코드를 작성하십시오.
