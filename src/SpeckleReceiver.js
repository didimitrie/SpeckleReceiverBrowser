import EventEmitter from 'event-emitter-es6'
import axios        from 'axios'

export default class SpeckleReceiver extends EventEmitter {
  constructor( args ) {
    super() 

    let self = this

    this.serverUrl = args.serverUrl
    this.token = args.token
    this.streamId = args.streamId
    this.serverName = null
    this.wsEndpoint = null
    this.restEndpoint = null

    this.layers = []  // placeholders, they're filled in the get stream.
    this.objects = []  // placeholders, they're filled in the get stream.
    this.objectProperties = []  // placeholders, they're filled in the get stream.
    this.name = null // placeholders, they're filled in the get stream.
    this.history = [] // placeholders, they're filled in the get stream.

    this.ws = null
    this.wsReconnectionAttempts = 0
    this.wsSessionId = null
    this.streamFound = false

    this.spkEvents = {
      'ws-session-id' : self.setSessionId.bind( self ),
      'live-update': self.liveUpdate.bind( self ),
      'metadata-update': self.metadataUpdate.bind( self ),
      'history-update': self.historyUpdate.bind( self ),
      'volatile-broadcast': self.volatileBroadcast.bind( self ),
      'volatile-message': self.volatileMessage.bind( self ),
      'server-message': self.serverMessage.bind( self ),
      'error': self.propagateError.bind( self )
    }

    this.handshake( ( err, handshakeData ) => {
      if( err ) return this.emit( 'error', err )
      this.restEndpoint = handshakeData.restApi
      this.wsEndpoint = handshakeData.ws
      this.serverName = handshakeData.serverName

      // handles ws disconnects
      this.wsConnectionCheker = setInterval( () => {
        if( ( !this.ws || this.ws.readyState == 3 ) && ( this.wsReconnectionAttempts < 20 ) ) {
          this.wsConnect()
          this.wsReconnectionAttempts++
        }
      }, 2000 )

      this.getStream()

      // emits the ready event if ws is connected and stream was found
      this.isReadyChecker = setInterval ( () => {
        if( !this.wsSessionId ) return
        if( !this.streamFound ) return

        this.emit('ready', this.name, this.layers, this.objects, this.history )
        clearInterval( this.isReadyChecker )
      }, 100 )
    })
  }

  handshake( callback ) {
    axios.get( this.serverUrl, { headers : { 'speckle-token': this.token } } )
    .then( response => {
      callback( null, response.data )
    } )
    .catch( error => {
      callback( error, null )
    })
  }

  wsConnect() {
    console.log( 'Attempting to connect to ws server.' )

    this.ws = new WebSocket( this.wsEndpoint + '/?access_token=' + this.token )

    this.ws.onopen = () => {
      console.log( 'Socket opened.' )
      this.wsReconnectionAttempts = 0
      this.ws.send( JSON.stringify( { eventName: "join-stream", args: { streamid: this.streamId, role: "receiver" } } ) )
    }
    
    this.ws.onmessage = msg => {
      if( msg.data === 'ping') {
        console.log('Socket was pinged!')
        return this.ws.send( 'alive' )
      }

      let parsedMsg = JSON.parse( msg.data )
      if( this.spkEvents.hasOwnProperty( parsedMsg.eventName ) ) 
        this.spkEvents[parsedMsg.eventName] ( parsedMsg )
      else return console.log('Undefined event', parsedMsg.eventName )
    }

    this.ws.onclose = ( reason ) => {
      console.log( reason )
      console.log( 'Socket closed.' )
    }
  }

  getStream() {
    console.log('Attempting to retrieve stream.')
    let self = this
    axios.get( this.restEndpoint + '/streams/' + this.streamId + '/data/', { headers : { 'speckle-token': this.token,  'speckle-ws-id': this.wsSessionId } } )
    .then( response => {
      if( !response.data.success ) return this.emit( 'error', response.message )

      self.layers = response.data.data.layers
      self.objects = response.data.data.objects
      self.objectProperties = response.data.data.objectProperties
      self.name = response.data.data.name
      self.objectProperties.forEach( prop => {
        self.objects[ prop.objectIndex ].properties = prop.properties
      })
      return axios.get( this.restEndpoint + '/streams/' + this.streamId, { headers : { 'speckle-token': this.token,  'speckle-ws-id': this.wsSessionId } } )
    })
    .then( response => {
      if( !response.data.success ) return this.emit( 'error', response.message )
      
      self.history = response.data.data.history
      self.streamFound = true
    })
    .catch( error => {
      this.emit( 'error', error )
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

    axios.get( this.restEndpoint + '/geometry/' + obj.hash  )
      .then( response => { 
        console.log( response )
        let myObject = response.data.data
        myObject.userProperties = obj.properties
        return callback( myObject )
      } )
      .catch( err => {
        throw new Error( err )
      })
  }

  broadcast( message ) {
    if( !this.streamId )
      throw new Error( 'No streamId, where should I broadcast?' )
    this.ws.send( JSON.stringify( { 
      eventName: "volatile-broadcast", 
      args: JSON.stringify( message ) 
    } ) )
  }

  sendMessage( message, recipient ) {
    if( !this.streamId || !recipient )
      throw new Error( 'No streamId or recipient. Meeep!')
    this.ws.send( JSON.stringify( {
      eventName: 'volatile-message',
      args: { message: JSON.stringify( message ), recipient: recipient }
    } ))
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
    this.history = msg.args
    this.emit( 'history-update', msg.args )
  }

  volatileBroadcast ( msg ) {
    this.emit( 'volatile-broadcast', msg )
  }

  volatileMessage ( msg ) {
    console.log( '!!! Got a volatile message')
    this.emit( 'volatile-message', msg )
  }

  serverMessage( msg ) {
    this.emit( 'server-message', msg )
  }

  propagateError( msg ) {
    this.emit( 'error', msg )
  }

  dispose() {
    this.ws.close()
    this.ws = null
    clearInterval( this.isReadyChecker )
    clearInterval( this.wsConnectionCheker )
  }
}