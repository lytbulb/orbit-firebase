function removeItem(array, condemned){
	return array.filter(function(item){
		return item !== condemned;
	});
}

function removeAt(array, index){
	var working = array.splice(0);
	working.splice(index, 1);
	return working;
}

function map(array, callback){
	var mapped = [];

	for(var i = 0; i < array.length; i++){
		mapped[i] = callback(array[i]);
	}

	return mapped;
}

function pluck(array, property){
	return map(array, function(item){
		return item[property];
	});
}

function any(array, callback){
	array.forEach(function(item){
		if (callback(item) ) return true;
	});

	return false;
}

function arrayToHash(array, value){
  var hash = {};

  array.forEach(function(item){
    hash[item] = value;
  });

  return hash;
}

export { removeItem, removeAt, map, pluck, any, arrayToHash };
