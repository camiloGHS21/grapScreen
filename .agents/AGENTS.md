# Project Architecture & Clean Code Rules

## 🏛️ 1. Rust Enterprise Architecture (DDD)
- Follow concentric Domain-Driven Design layers:
  - `domain/`: Entities, Value Objects, Domain Errors, and Ports/Traits (`StoragePort`, `OcrPort`). Zero external framework dependencies.
  - `application/`: Use Cases and Application Services.
  - `infrastructure/`: Adapters implementing domain traits (Filesystem, Win32, WinOCR, FFmpeg).
  - `presentation/`: Tauri Command handlers and IPC bridges.
- Inward dependency flow only towards `domain/`.

## ⚛️ 2. React Enterprise Architecture & Component Design
- Feature-Sliced Architecture (`components/`, `features/<feature>/`, `hooks/`).
- Separate UI presentation from business logic using custom hooks (`use<Feature>()`).
- Strict typing with explicit TypeScript interfaces (no `any`).

## 🧼 3. Clean Code Standards
- **Single Responsibility Principle (SRP)**: Each function, struct, and component must do one thing well.
- **Meaningful Naming**: Use clear, self-explanatory names for variables, functions, and structs.
- **Error Handling**: Use domain error types (`Result<T, DomainError>`). Never swallow errors or use `unwrap()` / `panic!` in production code.

## 📏 4. File Length Limit (Max 300 Lines)
- **CRITICAL**: No source code file may exceed **300 lines**.
- When creating or refactoring code, modularize large files immediately into smaller sub-components, custom hooks, or domain sub-modules.

## 🛠️ 5. Refactoring & Modification Execution
- When requested to refactor or edit code, always review and enforce the architectural principles above.
- **NO EXTERNAL EDITING SCRIPTS**: Do NOT generate or run `python`, `.ps1`, `.sh`, `sed`, or external scripts to create, edit, or delete source code files.
- **NATIVE IDE TOOLS ONLY**: Modify code directly using the IDE's native tools (`replace_file_content`, `multi_replace_file_content`, `write_to_file`).
