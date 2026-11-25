"""Local preview boundary checks: python3 -B tests/rescue_local_preview_test.py."""
import importlib.util
import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

spec = importlib.util.spec_from_file_location('preview', Path(__file__).resolve().parents[1] / 'scripts/rescue-local-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
LINES = [{'who': 'mia', 'text': 'We can do this together.'}, {'who': 'leo', 'text': 'I will watch the boat!'}]


class FakeEngine:
    voice = None
    failure = False
    calls = 0

    def reply(self, context):
        self.calls += 1
        if self.failure:
            raise RuntimeError('secret internal file path')
        self.context = context
        return LINES


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.server = preview.PreviewServer(('127.0.0.1', 0), self.engine, 'https://rescue.test')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method='POST', path='/api/rescue', data=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        body = json.dumps(data if data is not None else {'message': 'Can you cheer me up?', 'stage': 0})
        connection.request(method, path, body if method == 'POST' else None,
                           {'Origin': 'https://rescue.test', 'Content-Type': 'application/json', **(headers or {})})
        response = connection.getresponse()
        status, content = response.status, response.read()
        connection.close()
        return status, content

    def test_local_provider_and_no_cloud_claim(self):
        status, body = self.request('GET')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'available': True, 'provider': 'local', 'speech': False})

    def test_live_reply_has_no_action_fields_and_keeps_recent_context(self):
        history = [{'who': 'you', 'text': 'Call our squad Fog Foxes.'}]
        status, body = self.request(data={'message': 'What is our squad name?', 'stage': 1, 'history': history})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'source': 'ai', 'provider': 'local', 'lines': LINES})
        self.assertEqual(self.engine.context['recent_radio'], history)
        self.assertEqual(self.engine.context['objective'], preview.DIALOGUE['goals'][1])

    def test_origin_and_content_type_rejected_before_inference(self):
        self.assertEqual(self.request(headers={'Origin': 'https://other.test'})[0], 403)
        self.assertEqual(self.request(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.engine.calls, 0)

    def test_bad_payloads_and_unbounded_history_never_reach_model(self):
        for data in [{'message': 'hi', 'stage': True}, {'message': 'hi', 'stage': 9},
                     {'message': '<script>', 'stage': 0}, {'message': 'x' * 181, 'stage': 0},
                     {'message': 'hi', 'stage': 0, 'history': LINES * 4},
                     {'message': 'hi', 'stage': 0, 'win': True}]:
            self.assertEqual(self.request(data=data)[0], 400)
        self.assertEqual(self.request(data={'message': 'x' * 5000, 'stage': 0})[0], 413)
        self.assertEqual(self.engine.calls, 0)

    def test_outage_does_not_expose_internal_errors_or_block_static_game(self):
        self.engine.failure = True
        status, body = self.request()
        self.assertEqual(status, 503)
        self.assertNotIn(b'secret internal', body)
        self.assertIn(b'Mission simulator', body)
        self.assertEqual(self.request('GET', '/game/rescue.html')[0], 200)

    def test_rate_limit_and_busy_engine_are_retryable(self):
        self.server.model_lock.acquire()
        try:
            self.assertEqual(self.request()[0], 429)
        finally:
            self.server.model_lock.release()
        for _ in range(11):
            self.assertEqual(self.request()[0], 200)
        self.assertEqual(self.request()[0], 429)

    def test_invalid_model_output_fails_closed(self):
        for data in [{'lines': LINES, 'win': True}, {'lines': list(reversed(LINES))},
                     {'lines': [{'who': 'mia', 'text': '<img>'}, LINES[1]]}]:
            with self.assertRaises(ValueError):
                preview.validate_output(data)

    def test_optional_speech_unavailable_does_not_break_radio(self):
        self.assertEqual(self.request(path='/api/rescue/voice', data={'text': 'Hello captain!'})[0], 503)
        self.assertEqual(self.request()[0], 200)


if __name__ == '__main__':
    unittest.main()
