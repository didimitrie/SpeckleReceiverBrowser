import EventEmitter from 'event-emitter-es6'
import axios        from 'axios'

export default class SpeckleReceiver extends EventEmitter {
  constructor( args ) {
    super() 

    let self = this
    this.wsEndpoint = args.wsEndpoint
    this.restEndpoint = args.restEndpoint
    this.token = args.token
    this.streamId = args.streamId

    this.ws = null
    this.wsSessionId = null
    this.streamFound = false

    this.spkEvents = {
      'ws-session-id' : self.setSessionId.bind( self ),
      'live-update': self.liveUpdate.bind( self ),
      'metadata-update': self.metadataUpdate.bind( self ),
      'history-update': self.historyUpdate.bind( self ),
      'volatile-message': self.volatileMessage.bind( self )
    }

    this.getStream() 

    this.connectionCheker = setInterval( () => {
      if( !this.ws || this.ws.readyState == 3) this.connect()
    }, 1000 )

    this.isReadyChecker = setInterval ( () => {
      if( !this.wsSessionId ) return
      if( !this.streamFound ) return

      this.emit('ready', this.name, this.layers, this.objects, this.objectProperties )
      clearInterval( this.isReadyChecker )
    }, 100 )
  }

  connect() {
    console.log( 'Attempting to connect.' )

    this.ws = new WebSocket( this.wsEndpoint + '/?access_token=' + this.token )
    
    this.ws.onopen = () => {
      console.log( 'Socket opened.' )
      this.ws.send( JSON.stringify( { eventName: "join-stream", args: { streamid: this.streamId, role: "receiver" } } ) )
    }
    
    this.ws.onmessage = msg => {
      if( msg.data === 'ping') {
        console.debug('Ping!')
        return this.ws.send( 'alive' )
      }

      let parsedMsg = JSON.parse( msg.data )
      if( this.spkEvents.hasOwnProperty( parsedMsg.eventName ) ) this.spkEvents[parsedMsg.eventName] ( parsedMsg )
      else return console.log('Undefined event', parsedMsg.eventName )
    }

    this.ws.onclose = () => {
    }
  }

  getStream() {
    axios.get( this.restEndpoint + '/api/stream', { headers : { 'speckle-token': this.token, 'speckle-stream-id': this.streamId, 'speckle-ws-id': this.wsSessionId } } )
    .then( response => {
      if( response.data.success ) {
        this.layers = response.data.layers
        this.objects = response.data.objects
        this.objectProperties = response.data.objectProperties
        this.name = response.data.name

        this.objectProperties.forEach( prop => {
          console.log( prop )
          if( this.objects[prop.objectIndex] )
            this.objects[prop.objectIndex].userProperties = prop.properties
        })

        this.streamFound = true

      } else {
        this.emit( 'error', response.message )
      }
    })
  }

  setSessionId ( msg ) {
    this.wsSessionId = msg.sessionId
  }

  /////////////////////////////////////////////////////////
  /// PUBLIC-esque methods
  /////////////////////////////////////////////////////////
  getObjects( objs, callback ) {
    let receivedObjects = []
    for(let i = 0; i< objs.length; i++) 
      receivedObjects.push('placeholder')

    let extHead = 0
    objs.forEach( ( obj, index ) => {
      this.getObject( obj, response => {
        receivedObjects.splice( index, 1, response )
        if( ++extHead >= objs.length ) return callback( receivedObjects )
      })
    })
  }

  getObject( obj, callback ) {
    if( !obj ) {
      throw new Error('no obj provided')
      return
    }
    if( obj.hash.indexOf('NoHash') >= 0 )
      return callback( obj )

    axios.get( this.restEndpoint + '/api/object', { params: { hash: obj.hash } } )
      .then( response => { 
        let myObject = response.data.obj
        myObject.userProperties = obj.userProperties
        return callback( myObject )
      } )
      .catch( err => {
        throw new Error( err )
      })
  }

  broadcastVolatileMessage( message ) {
    if( !this.streamId )
      throw new Error( 'No streamId, where should I broadcast?' )
    this.ws.send( JSON.stringify( { eventName: "volatile-message", args: JSON.stringify( message ) } ) )
  }

  /////////////////////////////////////////////////////////
  /// EVENTS
  /////////////////////////////////////////////////////////
  liveUpdate ( msg ) {
    this.name = msg.args.name
    this.layers = msg.args.layers
    this.objects = msg.args.objects
    this.objectProperties = msg.args.objectProperties

    this.emit( 'live-update', msg.args.name, msg.args.layers, msg.args.objects, msg.args.objectProperties )
  }
  
  metadataUpdate ( msg ) {
    this.name = msg.args.name
    this.layers = msg.args.layers

    this.emit( 'metadata-update', msg.args.name, msg.args.layers )
  }

  historyUpdate ( msg ) {
    this.emit( 'history-update', msg.args )
  }

  volatileMessage ( msg ) {
    console.log( '!!! Got a volatile message')
    this.emit( 'volatile-message', msg )
  }

  dispose() {
    this.ws.close()
    this.ws = null
    clearInterval( this.isReadyChecker )
    clearInterval( this.connectionCheker )
  }
}