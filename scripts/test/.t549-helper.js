var fs = require('fs'), os = require('os'), path = require('path');
var REPO = path.resolve(__dirname, '../..');
var MOD_PATH = path.join(REPO, 'modules/PostToolUse/background-task-audit.js');

function fresh() { delete require.cache[require.resolve(MOD_PATH)]; return require(MOD_PATH); }
function cleanState(taskId) {
  var safe = (taskId || '').replace(/[^a-z0-9]/gi, '');
  var f = path.join(os.tmpdir(), '.bg-task-audit-' + safe);
  try { fs.unlinkSync(f); } catch(e) {}
}

var action = process.argv[2];

if (action === 'skip-non-taskoutput') {
  var m = fresh();
  var r = m({tool_name: 'Bash', tool_input: {command: 'test'}, tool_result: 'output'});
  console.log(r === null ? 'null' : 'not-null');
}
else if (action === 'completed-zero-output') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>completed</status><retrieval_status>success</retrieval_status>' +
    '<task_id>test123</task_id><output></output>'});
  console.log(r ? r.decision : 'null');
}
else if (action === 'completed-zero-reason') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>completed</status><retrieval_status>success</retrieval_status>' +
    '<task_id>test123</task_id><output></output>'});
  console.log(r ? r.reason : 'no-reason');
}
else if (action === 'completed-with-output') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>completed</status><retrieval_status>success</retrieval_status>' +
    '<task_id>test456</task_id><output>Build succeeded</output>'});
  console.log(r === null ? 'null' : r.decision);
}
else if (action === 'timeout-zero-output') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>timeout</retrieval_status>' +
    '<task_id>test789</task_id><output></output>'});
  console.log(r ? r.decision : 'null');
}
else if (action === 'timeout-zero-reason') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>timeout</retrieval_status>' +
    '<task_id>test789</task_id><output></output>'});
  console.log(r ? r.reason : 'no-reason');
}
else if (action === 'timeout-with-output') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>timeout</retrieval_status>' +
    '<task_id>test789b</task_id><output>Partial output here</output>'});
  console.log(r === null ? 'null' : r.decision);
}
else if (action === 'not-ready-first') {
  cleanState('poll1');
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>not_ready</retrieval_status>' +
    '<task_id>poll1</task_id><output></output>'});
  console.log(r === null ? 'null' : r.decision);
}
else if (action === 'not-ready-second') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>not_ready</retrieval_status>' +
    '<task_id>poll1</task_id><output></output>'});
  console.log(r ? r.decision : 'null');
}
else if (action === 'not-ready-second-reason') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>not_ready</retrieval_status>' +
    '<task_id>poll1</task_id><output></output>'});
  console.log(r ? r.reason : 'no-reason');
}
else if (action === 'not-ready-with-output') {
  cleanState('poll2');
  var m = fresh();
  m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>not_ready</retrieval_status>' +
    '<task_id>poll2</task_id><output></output>'});
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>running</status><retrieval_status>not_ready</retrieval_status>' +
    '<task_id>poll2</task_id><output>Starting up...</output>'});
  console.log(r === null ? 'null' : r.decision);
}
else if (action === 'clean-poll1') {
  cleanState('poll1');
  console.log('cleaned');
}
else if (action === 'whitespace-output') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result:
    '<status>completed</status><retrieval_status>success</retrieval_status>' +
    '<task_id>ws1</task_id><output>   \n  \n  </output>'});
  console.log(r ? r.decision : 'null');
}
else if (action === 'no-tool-result') {
  var m = fresh();
  var r = m({tool_name: 'TaskOutput', tool_result: undefined});
  console.log(r === null ? 'null' : r.decision);
}
