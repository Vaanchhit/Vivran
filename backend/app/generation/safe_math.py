"""Arithmetic the model proposes and code performs.

A worked example is only as good as its numbers, and a language model is not a
calculator. So the model never states a result: it names its inputs and writes
each step as an expression over them ("cfo - capex + net_borrowing"), and THIS
module evaluates it. Only plain arithmetic is allowed (numbers, names that were
defined, + - * / // % **, parentheses, unary minus); anything else is rejected,
which also makes it safe to evaluate text a model wrote.
"""
from __future__ import annotations

import ast
import math
import operator as op
import re
from typing import Any, Dict, List, Tuple

MAX_EXPR_CHARS = 120
MAX_EXPONENT = 6
_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,40}$")

_BINARY = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv, ast.FloorDiv: op.floordiv, ast.Mod: op.mod, ast.Pow: op.pow}
_UNARY = {ast.UAdd: op.pos, ast.USub: op.neg}


class MathError(ValueError):
    """The expression is not plain arithmetic over known names."""


def is_name(text: Any) -> bool:
    return isinstance(text, str) and bool(_NAME.match(text))


def safe_eval(expr: str, env: Dict[str, float]) -> float:
    if not isinstance(expr, str) or not expr.strip():
        raise MathError("empty expression")
    if len(expr) > MAX_EXPR_CHARS:
        raise MathError("expression too long")
    try:
        tree = ast.parse(expr.strip().replace("×", "*").replace("÷", "/").replace("^", "**"), mode="eval")
    except SyntaxError as e:
        raise MathError(f"not an expression ({e.msg})") from e

    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return float(node.value)
        if isinstance(node, ast.Name):
            if node.id not in env:
                raise MathError(f"unknown name '{node.id}'")
            return float(env[node.id])
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
            return _UNARY[type(node.op)](ev(node.operand))
        if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > MAX_EXPONENT:
                raise MathError("exponent too large")
            try:
                return _BINARY[type(node.op)](left, right)
            except ZeroDivisionError as e:
                raise MathError("division by zero") from e
        raise MathError("only plain arithmetic is allowed")

    value = ev(tree)
    if not math.isfinite(value):
        raise MathError("result is not a finite number")
    return value


def run_steps(inputs: List[Dict[str, Any]], steps: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Evaluates a worked example. Returns (steps with computed ``value``, problems).

    ``inputs`` are {"name","label","value","unit"}; ``steps`` are {"name","label","expr"}.
    A problem list that is empty means every number on screen was computed here.
    """
    env: Dict[str, float] = {}
    problems: List[str] = []
    for i in inputs:
        name = i.get("name")
        if not is_name(name):
            problems.append(f"Input name '{name}' must be lower_snake_case letters and digits.")
            continue
        if name in env:
            problems.append(f"Input '{name}' is defined twice.")
            continue
        try:
            env[name] = float(i["value"])
        except (KeyError, TypeError, ValueError):
            problems.append(f"Input '{name}' needs a numeric value.")
    out: List[Dict[str, Any]] = []
    for n, s in enumerate(steps, start=1):
        name = s.get("name")
        if not is_name(name):
            problems.append(f"Step {n} name '{name}' must be lower_snake_case letters and digits.")
            continue
        if name in env:
            problems.append(f"Step {n} reuses the name '{name}'.")
            continue
        try:
            value = safe_eval(s.get("expr", ""), env)
        except MathError as e:
            problems.append(f"Step {n} ('{s.get('label', name)}'): {e}.")
            continue
        env[name] = value
        out.append({**s, "value": round(value, 4)})
    return out, problems
