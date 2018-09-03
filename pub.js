var rpsClient = require('kyo_rps')
var rps = rpsClient('x2', {
  host : '127.0.0.1',
  port : 6379
})
rps.use('zookeeper', 'localhost:2181')
rps.ready(()=>{
  console.log('run')
  var a = 0
  var b = 0
  for(var i=0; i<500; i++) {
    rps.send('test', 'getUser', {
      num : 123
    }).then(data=>{
      if(data=='this is socket2') {
        b++
        console.log('b = '+ b)
      } else {
        a++
        console.log('a = '+ a)
      }
    }).catch(error=>{
      console.log(error)
    })
  }
  
})