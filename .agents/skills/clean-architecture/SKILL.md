---
name: clean-architecture
description: Guidelines for enterprise architecture in Rust (DDD), React component structure, Clean Code principles, 300-line file limit, and native tool file operations. Use whenever creating, refactoring, or auditing code in Rust or React projects.
---

# Clean Architecture, DDD & React Best Practices Skill

This skill enforces high-quality enterprise software design principles for **Rust** and **React** codebases, combined with strict **Clean Code** guidelines, modular file limits, and direct native tool execution.

---

## 🏛️ 1. Rust Enterprise Architecture (Domain-Driven Design - DDD)

Organize Rust codebases into concentric clean layers with strict inward dependency flow:

```
infrastructure/ (Adapters: DB, Web APIs, Hardware, System)
    └── presentation/ (Tauri Commands, CLI, REST Controllers)
        └── application/ (Use Cases, Application Services, DTOs)
            └── domain/ (Entities, Value Objects, Domain Errors, Ports/Traits)
```

### Layer Responsibilities:
1. **`domain/` (Core Domain Layer)**:
   - Zero external framework dependencies.
   - Defines Domain Entities, Value Objects, Domain Errors, and Input/Output **Ports (Traits)** (e.g. `StoragePort`, `OcrPort`, `ReplayObserver`).
   - Enforces business rules and invariants.
2. **`application/` (Application Layer)**:
   - Orchestrates domain entities to execute business use cases.
   - Accepts and returns DTOs or Domain Entities.
   - Depends only on `domain/` traits via dependency injection (`Arc<dyn Port>`).
3. **`infrastructure/` (Adapters Layer)**:
   - Implements `domain` traits (`FileStorageAdapter`, `WinOcrAdapter`, `SqliteAdapter`).
   - Handles low-level IO, OS APIs, database drivers, third-party integration libraries.
4. **`presentation/` (Presentation Layer)**:
   - Tauri command handlers, HTTP controllers, or CLI runners.
   - Converts HTTP/Tauri requests to application use case calls.

---

## ⚛️ 2. React Enterprise Architecture & Component Design

Organize React applications using Feature-Sliced / Clean Component Architecture:

```
src/
  ├── components/          # Shared atomic UI components (Button, Modal, Input, Toast)
  ├── features/            # Feature modules (e.g. flowchart, auth, layout)
  │     └── <feature_name>/
  │           ├── components/  # Feature-specific sub-components
  │           ├── hooks/       # Feature state & logic hooks (e.g. useFlowchartWorkspace)
  │           ├── utils/       # Pure helper functions
  │           └── index.ts     # Public feature export
  ├── hooks/               # Global custom hooks (useViewport, useDebounce)
  ├── types/               # Shared TypeScript interfaces & types
  └── styles/              # Global CSS & token variables
```

### Component Rules:
- **Single Responsibility Principle (SRP)**: Separate UI presentation from logic. Custom hooks (`use<Feature>()`) handle state/effects; components focus on JSX rendering.
- **Strict Typing**: No `any`. Explicit TypeScript interfaces for props, events, and states.
- **Composition over Inheritance**: Use slots/children and composable components instead of monolithic components.

---

## 🧼 3. Clean Code Principles

Follow Robert C. Martin's Clean Code standards:
1. **Meaningful Names**: Use intention-revealing, pronounceable, and unambiguous names for variables, functions, and structs.
2. **Small Functions**: Functions should do one thing, do it well, and do it only. Keep functions focused (under 30-40 lines).
3. **Explaining Comments**: Code should be self-documenting. Use comments only to explain *why* non-obvious design decisions were made, not *what* self-explanatory code does.
4. **Error Handling**: Treat errors as domain concepts. Avoid swallowing exceptions or using `unwrap()` / `panic!` in production Rust code (`Result<T, DomainError>` is mandatory).
5. **DRY (Don't Repeat Yourself)**: Extract common logic into domain services, shared utilities, or custom hooks.

---

## 📏 4. Strict File Length Limit (Max 300 Lines)

- **CRITICAL REQUIREMENT**: **No source code file should exceed 300 lines of code**.
- If a file approaches ~250-300 lines, refactor immediately by breaking it into smaller modular files:
  - Split large React components into sub-components in a `components/` directory.
  - Extract hook state logic into dedicated custom hooks in `hooks/`.
  - Split Rust structs, helper functions, or handlers into domain sub-modules or separate application services.

---

## 🛠️ 5. Refactoring & Code Modification Rules

When requested to create, refactor, or edit code:
1. **Always Audit Architecture**: Verify that code follows DDD (Rust) and Feature-Sliced / SRP (React).
2. **Never Use External Editing Scripts**: Do NOT create or run `python`, `ps1`, `bash`, `sed`, or helper scripts to modify, refactor, or delete files.
3. **Use Native IDE Tools Exclusively**:
   - Use `replace_file_content` for single contiguous edits.
   - Use `multi_replace_file_content` for multiple non-contiguous edits in a file.
   - Use `write_to_file` for creating new modular files.
   - Use `view_file` and `grep_search` to inspect definitions before editing.
