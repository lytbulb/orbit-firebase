import OperationFilter from 'orbit-firebase/operation-filter';
import { op } from 'tests/test-helper';

var operationFilter;

module("OF - OperationFilter", {
  setup: function() {
    operationFilter = new OperationFilter();
  },

  teardown: function() {
    operationFilter = null;
  }
});

test("should only block operations once", function(){
  var operation = op('add', 'planet/1', {id: 'pluto', name: 'Pluto'});

  operationFilter.blockNext(operation);

  ok(operationFilter.blocksNext(operation));
  ok(!operationFilter.blocksNext(operation));
});
