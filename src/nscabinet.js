'use strict'

var request = require('request'),
    through = require('through2'),
    jsonStream = require('JSONStream'),
    checkParams = require('./parameters.js'),
    vinyl = require('vinyl'),
    es = require('event-stream')


var out = (params) => {

    params = checkParams(params)

    return through.obj(function (chunk, enc, callback) {

        var that = this,
            path = chunk.path.substr(chunk.cwd.length + 1)

        var toRequest = requestOpts(params)
        toRequest.json = {
            action : 'upload',
            filepath: path,
            content: chunk.contents.toString('base64'),
            rootpath: params.rootPath
        }

        request( toRequest ).on('response', response => {

            chunk.nscabinetResponse = response
            that.push(chunk)
            response.pipe(jsonStream.parse('error.code')).pipe(process.stdout)
            response.pipe(jsonStream.parse('message')).pipe(process.stdout)
            callback()

        })

    })

}

out.upload = out

out.checkParams = checkParams

out.download = (files,params) => {

    params = checkParams(params)

    var toRequest = requestOpts(params)
    toRequest.json = {
        action : 'download' ,
        files : files ,
        rootpath: params.rootPath
    }

    var emitter = es.through(

        function write(data) {

            if (data.error) {
                console.error(data.error.message)
                this.emit('error',data.error)
                return
            }

            data.files.forEach( file => {

                var localPath = file.path.startsWith('/') ? 'cabinet_root' + file.path : file.path

                var vynFile = new vinyl({
                    path : localPath ,
                    contents : new Buffer(file.contents,'base64')
                })

                console.log(`Got file ${file.path}.`)

                this.emit('data',vynFile)

            })
        } ,

        function end() {
            this.emit('end')
        }
    )

    return request( toRequest )
        .pipe(es.split())
        .pipe(es.parse())
        .pipe(emitter)

}

module.exports = out

//private below here

function requestOpts(params) {

    var nlauthRolePortion = ( params.role ) ? `,nlauth_role=${params.role}` : '',
        server = process.env.NS_SERVER || `https://rest.${params.realm}/app/site/hosting/restlet.nl`

    return {
        url: server,
        qs: {
            script: params.script,
            deploy: params.deployment
        },
        method : 'POST' ,
        headers: {
            authorization: `NLAuth nlauth_account=${params.account},nlauth_email=${params.email},nlauth_signature=${params.password}${nlauthRolePortion}`
        }
    }

}