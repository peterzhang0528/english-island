"""Contract tests for the optional runner; no model or network required."""
import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('buddy_local', Path(__file__).resolve().parents[1] / 'scripts/buddy-coop-local.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def context():
    return {'message': 'Hello team', 'profile': 0, 'history': [],
            'world': dict.fromkeys(('wood', 'built', 'holding', 'lit', 'complete'), False)}


class LocalContractTests(unittest.TestCase):
    def test_plain_text_heart_does_not_poison_later_history(self):
        data = context()
        data['message'] = '<3'
        runner.validate_input(data)
        data['message'] = 'Hello again'
        data['history'] = [{'who': 'you', 'text': '<3'}]
        runner.validate_input(data)

    def test_model_markup_and_arbitrary_actions_still_fail(self):
        for output in [
            {'action': 'none', 'who': 'buddy', 'text': '<b>Hello</b>'},
            {'action': 'win', 'who': 'buddy', 'text': 'Done'},
            {'action': 'none', 'who': 'buddy', 'text': 'Hello\nworld'},
        ]:
            with self.assertRaises(ValueError):
                runner.validate_output(output)

    def test_expiry_uses_utc_and_keeps_the_inclusive_last_day(self):
        for today, available in [('2026-12-03', True), ('2026-12-04', False)]:
            with patch.object(runner, 'datetime') as clock:
                clock.now.return_value = datetime.fromisoformat(today).replace(tzinfo=timezone.utc)
                result = runner.validate_input(context())
                clock.now.assert_called_once_with(timezone.utc)
                self.assertEqual(result['profile'] is not None, available)


if __name__ == '__main__':
    unittest.main()
