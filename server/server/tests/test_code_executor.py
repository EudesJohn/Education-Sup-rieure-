"""Tests du service d'exécution de code."""

import json
import pytest
from services.code_executor import CodeExecutor


class TestCodeExecutor:
    """Tests du service d'exécution de code."""

    def setup_method(self):
        self.executor = CodeExecutor(max_time=5)

    def test_python_hello(self):
        """Test simple d'exécution Python."""
        result = self.executor.execute(
            'print("Hello from PEAN!")',
            "python",
        )
        assert result["exit_code"] == 0
        assert "Hello from PEAN!" in result["stdout"]
        assert result["error"] is None
        assert result["time_seconds"] > 0

    def test_python_with_stdin(self):
        """Test avec entrée standard."""
        result = self.executor.execute(
            "name = input()\nprint(f'Bonjour, {name}!')",
            "python",
            stdin="Étudiant",
        )
        assert result["exit_code"] == 0
        assert "Bonjour, Étudiant!" in result["stdout"]

    def test_python_error(self):
        """Test avec une erreur d'exécution."""
        result = self.executor.execute("print(1/0)", "python")
        assert result["exit_code"] != 0
        assert "ZeroDivisionError" in result["stderr"]

    def test_python_syntax_error(self):
        """Test avec une erreur de syntaxe."""
        result = self.executor.execute("def invalid syntax here", "python")
        assert result["exit_code"] != 0
        assert result["stderr"] != ""

    def test_timeout(self):
        """Test du timeout."""
        result = self.executor.execute(
            "import time\nwhile True: time.sleep(0.1)",
            "python",
        )
        assert result["exit_code"] == -1
        assert "Temps d'exécution dépassé" in (result["error"] or "")

    def test_empty_code(self):
        """Test avec code vide."""
        result = self.executor.execute("", "python")
        assert result["exit_code"] == 0

    def test_unsupported_language(self):
        """Test avec un langage inconnu."""
        from services.code_executor import CodeExecutionError
        with pytest.raises(CodeExecutionError) as exc:
            self.executor.execute("print('hi')", "brainfuck")
        assert "Langage non supporté" in str(exc.value)

    def test_execute_with_test_cases_all_pass(self):
        """Test avec des cas de test qui passent tous."""
        code = "n = int(input())\nprint(n * 2)"
        test_cases = [
            {"input": "5\n", "expected_output": "10", "description": "5*2=10"},
            {"input": "0\n", "expected_output": "0", "description": "0*2=0"},
            {"input": "-3\n", "expected_output": "-6", "description": "-3*2=-6"},
        ]
        result = self.executor.execute_with_test_cases(code, "python", test_cases)
        assert result["passed"] == 3
        assert result["total"] == 3
        assert all(r["passed"] for r in result["results"])

    def test_execute_with_test_cases_some_fail(self):
        """Test avec des cas de test dont certains échouent."""
        code = "n = int(input())\nprint(n * 2)"
        test_cases = [
            {"input": "5\n", "expected_output": "10", "description": "5*2=10"},
            {"input": "3\n", "expected_output": "7", "description": "3*2=7 (fail attendu)"},
        ]
        result = self.executor.execute_with_test_cases(code, "python", test_cases)
        assert result["passed"] == 1
        assert result["total"] == 2

    def test_language_list(self):
        """Vérifie que plusieurs langages sont supportés."""
        from services.code_executor import LANGUAGE_CONFIG
        assert "python" in LANGUAGE_CONFIG
        assert "javascript" in LANGUAGE_CONFIG
        assert "java" in LANGUAGE_CONFIG
        assert "cpp" in LANGUAGE_CONFIG
        assert "go" in LANGUAGE_CONFIG
        assert "rust" in LANGUAGE_CONFIG
