var rpsClient = require('kyo_rps')
var rps = rpsClient('socket2', {
  host : '127.0.0.1',
  port : 6379
})
rps.use('zookeeper', 'localhost:2181')
rps.ready(()=>{
  console.log('rps is ready.')
  rps.registerService('test').then(data=>{
    console.log(data)
  }).catch(error=>{
    console.log(error)
  })
  rps.on('getUser', (req, res)=>{
    res('this is socket2')
  })
})