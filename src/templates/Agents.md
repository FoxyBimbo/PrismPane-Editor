# Agent Specifications

## 1. Definition
*   **Identifier:** System name or reference code for the agent.
*   **Core Role:** The single, definitive responsibility assigned to this agent.
*   **Operational Scope:** What the agent is explicitly allowed and not allowed to do.

## 2. Execution Environment
*   **Base Engine:** The underlying model, engine, or runtime environment powering the agent.
*   **Parameters:** Fixed execution configurations (e.g., deterministic constraints, token thresholds).
*   **Dependencies:** External libraries, SDKs, or frameworks required for execution.

## 3. Core Instructions
```text
[Insert primary system instructions, behavioral boundaries, and execution rules here]
```

## 4. Interface Boundaries
*   **Input Schema:** Describe the expected format, required variables, and structure of incoming data.
*   **Output Schema:** Describe the structural format, validation rules, and delivery method of outgoing data.
*   **Connected Tools:** List external systems, APIs, or sandboxes the agent can interact with.

## 5. Validation and Test Cases
*   **Success Criteria:** Measurable indicators that determine if the agent executed correctly.
*   **Baseline Input:** A control example used to test agent reliability.
*   **Expected Target Output:** The target response against which execution is evaluated.
