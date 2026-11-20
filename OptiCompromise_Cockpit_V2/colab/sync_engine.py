"""Embed the API math engine in the standalone Colab notebook."""
import json
from pathlib import Path


def engine_source(core: Path) -> str:
    modules = ("schemas", "payoff", "compromise", "pareto")
    blocks = ["# Motor generado por colab/sync_engine.py a partir de api/core."]
    for module in modules:
        lines = (core / f"{module}.py").read_text(encoding="utf-8").splitlines()
        blocks.append("\n".join(line for line in lines if not line.startswith("from .")).strip())
    blocks.append('''def resolver_opticompromise(model, weights=None, compute_pareto=True):
    definition = ModelDefinition.model_validate(model)
    payoff = compute_payoff_matrix(definition)
    if payoff.status != "optimal":
        raise ValueError(payoff.status)
    solutions, applied_weights = solve_all_metrics(
        definition, payoff, definition.weights if weights is None else weights,
    )
    points = compute_pareto_frontier(definition, payoff) if compute_pareto else []
    return payoff, solutions, applied_weights, points''')
    return "\n\n".join(blocks)


if __name__ == "__main__":
    path = Path(__file__).with_name("OptiCompromise_Colab.ipynb")
    notebook = json.loads(path.read_text(encoding="utf-8"))
    cell = notebook["cells"][2]
    cell.update(source=engine_source(path.resolve().parents[1] / "api" / "core").splitlines(keepends=True),
                outputs=[], execution_count=None)
    path.write_text(json.dumps(notebook, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
