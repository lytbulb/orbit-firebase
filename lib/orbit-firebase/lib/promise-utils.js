/* global clearTimeout */

function timeoutPromise(promise, label, ms){
  if(!promise || !promise.then) console.error("Not a promise", label);

  ms = ms || 2000;
  var timeout = setTimeout(function(){
    console.log(label);
  }, ms);

  return promise.then(function(result){
    clearTimeout(timeout);
    return result;
  });
}

export { timeoutPromise };
