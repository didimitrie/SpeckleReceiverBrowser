
myReceiver = new SpeckleReceiver( { 
        wsEndpoint: 'wss://5th.one',
        restEndpoint: 'https://5th.one',
        token: 'asdf',
        streamId: 'XYZ'
      } )
      
      $('#thebutton').val( 'Connecting...' )

      myReceiver.on('ready', function( name, layers, objects ) {
        console.log( 'Connection ready.' )

      })

      myReceiver.on('live-update', function( name, layers, objects ) {
        console.log( 'Got a live update.' )
        $('#streamname').text( name )
        $('#streamlayers').text( JSON.stringify( layers, null, 2 ) )
        $('#streamobjects').text( JSON.stringify( objects, null, 2 ) )
        $('#streamobjects').text( JSON.stringify( objects, null, 2 ) )

        myObjects = objects
      })

      myReceiver.on('metadata-update', function( name, layers ) {
        console.log( 'Got a live update.' )
        $('#streamname').text( name )
        $('#streamlayers').text( JSON.stringify( layers, null, 2 ) )
      })

      myReceiver.on('volatile-message', function (message) {
        console.log( message )
        $('#receivedMessages').append( Date.now() + ': ' + message.args + '\n')
      })