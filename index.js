var redis = require('redis')
var EventEmitter = require('events').EventEmitter
var event = new EventEmitter()
var event2 = new EventEmitter()
const uuidv4 = require('uuid/v4')
var moment = require('moment')
var _ = require('lodash')
var zookeeper = require('node-zookeeper-client')

var rps = {
    data : {
        channel : 'rps',
        readyCount : 2,
        useZookeeper : false,
        rpsService : '/rpsService'
    }
}

module.exports = (channel, redisClientOption, redisAuth)=>{
    if(channel) {
        rps.data.channel = channel
    }
    var pub = redis.createClient(redisClientOption)
    var sub = redis.createClient(redisClientOption)
    //rps ready
    rps.ready = (cb)=>{
        event2.once('ready', ()=>{
            cb()
        })
    }
    var ready = 0
    pub.on('ready', function(){
        ready++
        if(ready>=rps.data.readyCount) {
            event2.emit('ready')
        }
    })
    sub.on('ready', function(){
        ready++
        if(ready>=rps.data.readyCount) {
            event2.emit('ready')
        }
    })
    sub.on('message', function (channel, message) {
        try {
            var arg = JSON.parse(message)
            //console.log('message : '+arg.name)
            event.emit(arg.name, arg)
        } catch (e) {

        }
    })
    sub.subscribe(rps.data.channel)
    //join channel
    rps.join = (channel)=>{
        sub.subscribe(channel)
    }
    //send message
    //send to channel or service
    rps.send = (channel, name, data, exitTime)=>{
        return new Promise((resolve, reject) => {
            var sendMessage = (channel)=>{
                let key = channel+':'+name+':'+moment().format('x')+':'+uuidv4()
                let message = JSON.stringify({
                    form : rps.data.channel,
                    to : channel,
                    name : name,
                    key : key,
                    data : data
                })
                pub.publish(channel, message)
                let status = false
                if(!exitTime>0) {
                    exitTime = 3000
                }
                event.once(key, (data)=>{
                    if(!status) {
                        status = true
                        if(data.error) {
                            reject(data.error)
                        } else {
                            resolve(data.data)
                        }
                    }
                })
                setTimeout(()=>{
                    if(!status) {
                        status = true
                        return reject('time out')
                    }
                },exitTime)
            }
            if(!rps.data.useZookeeper) {
                sendMessage(channel)
                return
            }
            rps.zookeeperClient.exists(rps.data.rpsService+'/'+channel, function (err, stat) {
                if (err) {
                    return reject('zookeeper time out : 1004')
                }
                if(!stat) {
                    sendMessage(channel)
                    return
                }
                rps.zookeeperClient.getChildren(rps.data.rpsService+'/'+channel, function (err, children, stats) {
                    if (err) {
                        return reject('zookeeper time out : 1005')
                    }
                    if(children.length>0) {
                        if(children.length==1) {
                            sendMessage(children[0])
                        } else {
                            let index = _.random(0,children.length-1)
                            console.log(children[index])
                            sendMessage(children[index])
                        }
                    } else {
                        sendMessage(channel)
                    }
                })
            })
        })
    }
    //get message
    rps.on = (name, cb)=>{
        event.on(name, (arg)=>{
            let res = (data)=>{
                let message = JSON.stringify({
                    name : arg.key,
                    data : data
                })
                pub.publish(arg.form, message)
            }
            cb(arg.data, res)
        })
    }
    //use zookeeper
    rps.use = (name, option)=> {
        if(name=='zookeeper') {
            rps.data.useZookeeper = true
            rps.data.readyCount = 3
            rps.zookeeperClient = zookeeper.createClient(option)
            rps.zookeeperClient.once('connected', function () {
                rps.zookeeperClient.exists(rps.data.rpsService, function (err, stat) {
                    if (err) {
                        return console.log(err.stack)
                    }
                    if (stat) {
                        ready++
                        if(ready>=rps.data.readyCount) {
                            event2.emit('ready')
                        }
                    } else {
                        rps.zookeeperClient.create(rps.data.rpsService, null, zookeeper.CreateMode.PERSISTENT, function (err, path) {
                            if (err) {
                                return console.log(err.stack)
                            }
                            ready++
                            if(ready>=rps.data.readyCount) {
                                event2.emit('ready')
                            }
                        })
                    }
                })
            })
            rps.zookeeperClient.connect()
        }
    }
    rps.registerService = (name)=>{
        return new Promise((resolve, reject) => {
            if(!rps.data.useZookeeper) {
                return reject('must use zookeeper')
            }
            var addService = (name)=>{
                rps.zookeeperClient.create(rps.data.rpsService+'/'+name+'/'+rps.data.channel, new Buffer(rps.data.channel), zookeeper.CreateMode.EPHEMERAL, function (err, path) {
                    if (err) {
                        return reject('zookeeper time out : 1001')
                    }
                    resolve({
                        name : name,
                        channel : rps.data.channel
                    })
                })
            }
            rps.zookeeperClient.exists(rps.data.rpsService+'/'+name, function (err, stat) {
                if (err) {
                    return reject('zookeeper time out : 1002')
                }
                if(stat) {
                    addService(name)
                } else {
                    rps.zookeeperClient.create(rps.data.rpsService+'/'+name, null, zookeeper.CreateMode.PERSISTENT, function (err, path) {
                        if (err) {
                            return reject('zookeeper time out : 1003')
                        }
                        addService(name)
                    })
                }
            })
        })
    }
    return rps
}