import OperationSequencer from 'orbit-firebase/operation-sequencer';
import { captureDidTransforms, op } from 'tests/test-helper';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Cache from 'orbit-common/cache';
import Orbit from 'orbit/main';
import { Promise } from 'rsvp';
import { map } from 'orbit-firebase/lib/array-utils';

var schemaDefinition = {
  modelDefaults: {
    keys: {
      'id': {primaryKey: true, defaultValue: uuid}
    }
  },
  models: {
    "project-board": {
      attributes: {
        name: {type: 'string'}
      },
      links: {
        taskBoards: {type: 'hasMany', model: 'task-board', inverse: 'projectBoard'}
      }
    },
    "task-board": {
      attributes: {
        name: {type: 'string'},
      },
      links: {
        projectBoard: {type: 'hasOne', model: 'project-board', inverse: 'taskBoards'}
      }
    }
  }
};

var operationSequencer,
    cache;

module("OF - OperationSequencer", {
  setup: function() {
    Orbit.Promise = Promise;

    var schema = new Schema(schemaDefinition);
    cache = new Cache(schema);
    operationSequencer = new OperationSequencer(cache, schema);
  },

  teardown: function() {
  }
});

test("emits dependent add to hasMany link operation after add records", function(){
  var addLinkOperation = op('add', 'project-board/project-board1/__rel/taskBoards/task-board1', true);
  var addTaskBoardOperation = op('add', 'task-board/task-board1', {id: 'task-board1', name: 'Development', __rel: {projectBoard: null}});
  var addProjectBoardOperation = op('add', 'project-board/project-board1', {id: 'project-board1', name: 'KBR', __rel: {taskBoards: {}}});

  operationSequencer.process(addLinkOperation);
  ok(!cache.retrieve(addLinkOperation.path), 'link not added yet');

  operationSequencer.process(addProjectBoardOperation);
  ok(!cache.retrieve(addLinkOperation.path), 'link not added yet');

  operationSequencer.process(addTaskBoardOperation);
  ok(cache.retrieve(addLinkOperation.path), 'link added after records added');
});

test("emits operations in same sequence if they arrive in correct order", function(){
  var addLinkOperation = op('add', 'project-board/project-board1/__rel/taskBoards/task-board1', true);
  var addTaskBoardOperation = op('add', 'task-board/task-board1', {id: 'task-board1', name: 'Development', __rel: {projectBoard: null}});
  var addProjectBoardOperation = op('add', 'project-board/project-board1', {id: 'project-board1', name: 'KBR', __rel: {taskBoards: {}}});

  operationSequencer.process(addProjectBoardOperation);
  operationSequencer.process(addTaskBoardOperation);
  operationSequencer.process(addLinkOperation);

  ok(cache.retrieve(addLinkOperation.path), 'link added after records added');
});

test("never emits attribute operations that arrive before record has been added", function(){
  var replaceAttributeOperation = op('replace', 'task-board/task-board1/name', "Development2");
  var addTaskBoardOperation = op('add', 'task-board/task-board1', {id: 'task-board1', name: 'Development', __rel: {projectBoard: null}});

  operationSequencer.process(replaceAttributeOperation);
  operationSequencer.process(addTaskBoardOperation);

  equal(cache.retrieve(addTaskBoardOperation.path).name, "Development", "replace attribute operation wasn't applied");
});

