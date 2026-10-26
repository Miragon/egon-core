# Triage of surviving mutants

Read this whenever Stryker reports `Survived` or `NoCoverage` on a domain file.

## Statuses and the score

Score = (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage).

| Status       | Meaning                                             | Counts in score? |
| ------------ | --------------------------------------------------- | ---------------- |
| Killed       | A test failed against the mutant.                   | yes, detected    |
| Timeout      | The mutant hung, for example an endless loop.       | yes, detected    |
| Survived     | All covering tests passed against the mutant.       | yes, undetected  |
| NoCoverage   | No unit test executes this code.                    | yes, undetected  |
| CompileError | The TypeScript checker rejected the mutant.         | no               |
| Ignored      | A `// Stryker disable` comment excludes the mutant. | no               |

`NoCoverage` in a domain file usually means one of two things. The code is
reachable only through browser tests, so it needs a unit spec. Or it is dead,
so delete it.

## Decide in this order

1. **Can a test observe the difference?** Feed an input that takes the mutated
   path and assert on the result through the public API. If such an input
   exists, the mutant shows a **missing assertion**: write the test. Most
   survivors are this kind.
2. **Can no input observe it, because the mutant is equivalent?** Then
   **simplify the code** so the mutant cannot exist. Examples from this
   codebase:
    - `type.startsWith(X)` on exact type strings: `startsWith` and `endsWith`
      behave the same, so use `type === X`.
    - A guard repeated by a later check: delete the redundant one.
    - `new Array(n)` when the size does not matter: use `[]`.
    - `if (a > max) a = max` style clamping, where `>` and `>=` give the same
      result: rewrite it as `Math.min(a, max)`.
    - Optional chaining on a value the types already guarantee: remove `?.`.
3. **Is it unreachable, i.e. dead code?** Delete it. Do not test it.
4. **Only then annotate**, on the line above, naming the mutator:

    ```ts
    // Stryker disable next-line EqualityOperator: at equality both branches return the bound
    ```

    The reason must explain why no test can tell the difference, not that
    testing it is inconvenient. Disables that cover a block or a whole file,
    and `all`, are not allowed.

## Mutators and how to kill them

| Mutator                                                   | Typical survivor                                                | Killing test                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EqualityOperator`                                        | `<` ↔ `<=`, `===` ↔ `!==`                                       | Inputs at the boundary and one either side                                                                         |
| `ConditionalExpression`                                   | Condition forced to `true` or `false`                           | One case where the condition is true and one where it is false, with different outcomes                            |
| `LogicalOperator`                                         | `&&` ↔ `\|\|`                                                   | Cases where exactly one operand is true                                                                            |
| `BlockStatement`                                          | Body emptied                                                    | Assert the body's effect or return value                                                                           |
| `BooleanLiteral`                                          | `true` ↔ `false`, `!x` → `x`                                    | Assert the flag's observable consequence                                                                           |
| `StringLiteral`                                           | `"x"` → `""`                                                    | Assert exact strings. Error text that is part of the contract: `toThrow("…")`; otherwise use a typed error or code |
| `ArrayDeclaration` / `ObjectLiteral`                      | `[]` → `["Stryker was here"]`, `{}` emptied                     | Assert exact content, not only length                                                                              |
| `MethodExpression`                                        | `.trim()` removed, `filter` ↔ `some`, `startsWith` ↔ `endsWith` | Inputs where the method changes the result (surrounding whitespace, mixed collections)                             |
| `Regex`                                                   | Anchor, quantifier or class changed                             | Inputs with leading or trailing junk, empty input, single and multi-digit values                                   |
| `OptionalChaining`                                        | `a?.b` → `a.b`                                                  | A `null` or `undefined` input. If the types forbid that, remove the `?.` instead                                   |
| `ArithmeticOperator` / `UpdateOperator` / `UnaryOperator` | `+` ↔ `-`, `++` ↔ `--`, `-x` → `x`                              | Values where the operators give different results (not 0 or 1)                                                     |
| `ArrowFunction`                                           | `() => x` → `() => undefined`                                   | Assert the callback's result is used                                                                               |

## Anti-patterns

- **Asserting with `toBeTruthy()` or `toBeDefined()`, or only on lengths.**
  Mutants survive and the test documents nothing.
- **Exporting private helpers to test them directly.** Test through the
  object; delete branches that are unreachable from it.
- **Snapshotting large objects to kill many mutants at once.** It works
  mechanically but hides intent. Prefer explicit expectations about the
  invariant.
- **Annotating instead of simplifying.** Each annotation is reviewed code
  carrying a lasting claim about equivalence.
