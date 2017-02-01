### Speckle Receiver [JS]

####Include the script: 
```
<script src="../dist/SpeckleReceiver.js"></script>
```

####Intialisation: 
```javascript
myReceiver = new SpeckleReceiver( { 
    wsEndpoint: $( '#ws' ).val(),
    restEndpoint: $( '#rest' ).val(),
    token: $( '#token' ).val(),
    streamId: $( '#streamid' ).val()
} )
```

####Events:
##### Ready:
Fired when we have established a connection with the server (websockets) and we received the stream's live historyInstace.
```javascript
    myReceiver.on('ready', ( name, layers, objects ) => { 
        //do magic
    })
}
```

##### Live update:
Fired when a live update was received from a sender.
```javascript
    myReceiver.on('live-update', ( name, layers, objects ) => { 
        //do magic
    })
}
```

##### Metadata update:
Fired when a metadata update was received from a sender. It's now time to update them layers. 
```javascript
    myReceiver.on('live-update', ( name, layers ) => { 
        //do magic
    })
}
```

####Methods:
We have two main public use methods embedded in the receiver: `getObject` and `getObjects`. One queries the server for a SINGLE object, the other queries the server for a LIST of objects and calls back with an array that preservers the original order.
```javascript
myObjects.forEach( ( obj, i ) => {
    myReceiver.getObject( obj, response => { 
        // response holds the full object.
    })
})
```
vs.
```javascript
myReceiver.getObjects( myObjects, objs => {
    // objs is the array with all the objects. order is preserved from myObjects.
} )
```






