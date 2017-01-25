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

      this.emit('ready', this.name, this.layers, this.objects )
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
      console.debug( 'Got a message. My wsSessionId is', this.wsSessionId )
      if( msg.data === 'ping')
        return this.ws.send( 'alive' )

      let parsedMsg = JSON.parse( msg.data )
      if( this.spkEvents.hasOwnProperty( parsedMsg.eventName ) ) this.spkEvents[parsedMsg.eventName] ( parsedMsg )
      else return console.log('Undefined event', parsedMsg.eventName )
    }

    this.ws.onclose = () => {
    }
  }

  sendVolatileMessage( message ) {
    this.ws.send( JSON.stringify( { eventName: "volatile-message", args: JSON.stringify( message ) } ) )    
  }

  getStream() {
    axios.get( this.restEndpoint + '/api/stream', { headers : { 'speckle-token': this.token, 'speckle-stream-id': this.streamId, 'speckle-ws-id': this.wsSessionId } } )
    .then( response => {
      console.log( response )
      if( response.data.success ) {
        this.layers = response.data.layers
        this.objects = response.data.objects
        this.name = response.data.name
        this.streamFound = true
      } else {
        this.emit( 'error', response.message )
      }
    })
  }

  getObjects( objects ) {
    console.log( 'getting all...')
    let getAll = objects.map( this.getObject.bind(this) )
    return new Promise( ( resolve, reject ) => {
      Promise.all( getAll )
      .then( res => {
        return resolve( res.map( o => o.data.obj ) )
      })
      .catch( err => {
        return reject( err )
      })
    })
  }

  getObject( obj ) {
    if( !obj ) 
      throw new Error('no obj provided')
    if( obj.hash.indexOf('NoHash') >= 0 )
      return obj

    return axios.get( this.restEndpoint + '/api/object', { params: { hash: obj.hash } } )
  }

  setSessionId ( msg ) {
    console.log( '!!! Got my wsSessionId', msg.sessionId )
    this.wsSessionId = msg.sessionId
  }

  liveUpdate ( msg ) {
    this.emit( 'live-update', msg.args.name, msg.args.layers, msg.args.objects )
  }
  
  metadataUpdate ( msg ) {
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