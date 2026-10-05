"""Capture real /api/profiles/sessions pages; never open the user's state DB."""
import json
import os
import time
from pathlib import Path
from hermes_state import SessionDB
from hermes_cli.web_routers import profiles

home = Path(os.environ['HERMES_HOME'])
assert home.is_relative_to(Path(os.environ['TMPDIR'])), 'Use a scratch-only HERMES_HOME'
home.mkdir(parents=True, exist_ok=True)
assert not (home / 'state.db').exists(), 'Require a fresh isolated store'
profiles._cron_profile_home = lambda name: (name, home)

def capture(order='recent'):
    return profiles.get_profiles_sessions(limit=500, offset=0, min_messages=0,
        archived='exclude', order=order, profile='default')

# Same session-list parameters as the plugin recent-order bridge adapter.
db = SessionDB(home / 'state.db')
db.create_session('visible', source='cli')
db.create_session('hidden', source='cli')
db.set_session_hidden('hidden', True)
db.close()
hidden_short = capture()
assert hidden_short['total'] == 2
assert [s['id'] for s in hidden_short['sessions']] == ['visible']
assert not hidden_short['errors'] and not hidden_short['storage']

db = SessionDB(home / 'state.db')
# Prove the existing router's real recent ordering differs from created ordering.
assert db._conn is not None
base = time.time() + 10
for identity, started, active in [('activity-old', base, base + 5), ('activity-new', base + 1, base + 2)]:
    db.create_session(identity, source='cli')
    db._conn.execute('UPDATE sessions SET started_at=?, last_activity_at=? WHERE id=?', (started, active, identity))
db._conn.commit()
db.close()
recent_ids = [row['id'] for row in capture()['sessions']][:2]
created_ids = [row['id'] for row in capture('created')['sessions']][:2]
assert recent_ids == ['activity-old', 'activity-new']
assert created_ids == ['activity-new', 'activity-old']
db = SessionDB(home / 'state.db')
assert db._conn is not None
db._conn.execute("DELETE FROM sessions WHERE id IN ('activity-old', 'activity-new')")
# Pin an old row so the real backend back-fills it beyond the 500-row window.
assert db._conn is not None
db._conn.execute("UPDATE sessions SET pinned=1, started_at=1 WHERE id='visible'")
for index in range(500):
    db.create_session(f'new-{index}', source='cli')
db._conn.commit()
db.close()
pinned_full = capture()
assert len(pinned_full['sessions']) == 501
assert any(s['id'] == 'visible' and s['pinned'] for s in pinned_full['sessions'])
assert not pinned_full['errors'] and not pinned_full['storage']
print(json.dumps({'hidden_short': hidden_short, 'pinned_full': pinned_full, 'recent_ids': recent_ids, 'created_ids': created_ids}))
