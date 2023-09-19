import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Image,
  LogBox,
  Button,
  Alert, // Import Alert
  BackHandler, // Import BackHandler
} from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import MQTT from 'sp-react-native-mqtt';
import Toast from 'react-native-toast-message';

LogBox.ignoreAllLogs()

const App = () => {
  const [userLocation, setUserLocation] = useState(null);
  const [mqttMessage, setMqttMessage] = useState([]);
  const [mqttMessageTime, setMqttMessageTime] = useState([]);

  const [alertMarkers, setAlertMarkers] = useState([]); // Tableau pour stocker les marqueurs d'alerte
  const [mqttConnected, setMqttConnected] = useState(false);


  // Create a ref for the Toast component
  const toastRef = useRef(null);

  useEffect(() => {
    fetchData();
    connectToMqttServer();
  }, []);

  const fetchData = async () => {
    // Demander la permission de géolocalisation (Android uniquement)
    if (Platform.OS === 'android') {
      const granted = await requestLocationPermission();
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Permission de géolocalisation accordée.');
        // Obtenir la position de l'appareil
        getCurrentLocation();
      } else {
        // Handle the case where permission is denied
        handlePermissionDenied();
      }
    }
  };

  const connectToMqttServer = async () => {
    try {
      /* Créer un client MQTT */
      const client = await MQTT.createClient({
        uri: 'mqtt://192.168.1.3:1883',
        clientId: 'your_client_id',
      });
  
      client.on('closed', () => {
        console.log('mqtt.event.closed');
        setMqttConnected(false); // MQTT server is disconnected
      });
  
      client.on('error', (msg) => {
        console.log('mqtt.event.error', msg);
        setMqttConnected(false); // MQTT server encountered an error
      });
  
      client.on('message', (msg) => {
        const msgObject = JSON.parse(msg.data);
        if (msgObject.message_type === 1) {
          setMqttMessage(msgObject.perceived_objects);
          console.log(msgObject.timeOfMeasurement);
          setMqttMessageTime(msgObject.timeOfMeasurement);
        } else if (msgObject.message_type === 0) {
          // Afficher le toast pour le message de type 0
          showToast('ALERT DETECTED !');
          // Ajouter le marqueur d'alerte
          addAlertMarker(msgObject);
        }
      });
  
      client.on('connect', () => {
        console.log('connected');
        client.subscribe('display_topic', 0);
        setMqttConnected(true); // MQTT server is connected
      });
  
      client.connect();
    } catch (err) {
      console.log(err);
      setMqttConnected(false); // MQTT server connection failed
    }
  };

  const requestLocationPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Permission de géolocalisation accordée.');
      } else {
        console.log('Permission de géolocalisation refusée.');
      }
      return granted;
    } catch (err) {
      console.warn(err);
    }
  };

  const handlePermissionDenied = () => {
    // Show an alert to the user
    Alert.alert(
      'Permission Denied',
      'You need to grant location permission to use this app.',
      [
        {
          text: 'Retry',
          onPress: () => fetchData(), // Retry requesting permission
        },
        {
          text: 'Close App',
          onPress: () => {
            // Close the app if permission is denied
            // You may add additional logic here if needed
            // For example, showing a message to the user before closing
            BackHandler.exitApp(); // Make sure to import BackHandler from 'react-native'
          },
          style: 'cancel',
        },
      ]
    );
  };

  const getCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
      },
      (error) => {
        console.warn(error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const showToast = (message) => {
    Toast.show({
      type: 'error',
      text1: 'ALERT',
      text2: message,
      position: 'top',
      visibilityTime: 4000, // Durée d'affichage du toast en millisecondes
      autoHide: true,
      topOffset: 30, // Décalage par rapport au haut de l'écran
      bottomOffset: 40, // Décalage par rapport au bas de l'écran
    });
  };

  const addAlertMarker = (marker) => {
    // Ajouter un marqueur d'alerte à la liste
    setAlertMarkers((prevMarkers) => [
      ...prevMarkers,
      marker,
    ]);

    // Définir une minuterie pour supprimer le marqueur après 10 secondes
    setTimeout(() => {
      removeAlertMarker();
    }, 10000);
  };

  const removeAlertMarker = () => {
    // Supprimer le premier marqueur d'alerte de la liste
    setAlertMarkers((prevMarkers) => prevMarkers.slice(1));
  };

  return (
    <View style={styles.container}>
      {!mqttConnected && (
        <View>
          <Text>Failed to connect to MQTT server</Text>
          <Button title="Retry Connection" onPress={connectToMqttServer} />
        </View>
      )}
      {userLocation && (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.0011,
          }}
          showsUserLocation={true}
        >
          {mqttMessage &&
            mqttMessage.map((marker, index) => (
              <Marker
                key={index}
                coordinate={{
                  latitude: marker.latitude,
                  longitude: marker.longitude,
                }}
                pinColor={(marker.object_class < 1 && marker.object_class > 3) && 'grey'}
              >
                <Image
                  source={(marker.object_class == 1)?require('./img/person.png'):(marker.object_class == 2)?require('./img/bicycle.png'):(marker.object_class == 3 && require('./img/car.png'))}
                  style={styles.markerImage}
                />
                
                <Callout style={styles.calloutContainer}>
                  <View>
                    <Text style={styles.textStyleTitle}>{(marker.object_class == 1)?`Pedestrian`:(marker.object_class == 2)?`Cyclist`:(marker.object_class == 3 && `Vehicle`)}</Text>
                    <Text style={styles.textStyle}>{'ID: '+ marker.ID}</Text>
                    <Text style={styles.textStyle}>{'Time Of Measurement: '+ mqttMessageTime}</Text>
                    <Text style={styles.textStyle}>{'Altitude: '+ marker.altitude}</Text>
                    <Text style={styles.textStyle}>{'Heading: '+ marker.heading}</Text>
                    <Text style={styles.textStyle}>{'Speed: '+ marker.speed}</Text>
                    <Text style={styles.textStyle}>{'Reference Point: '+ marker.reference_point}</Text>
                  </View>
                </Callout>
              </Marker>
            ))
          }
          {/* Afficher tous les marqueurs d'alerte */}
          {alertMarkers.map((marker, index) => (
            <Marker
              key={index}
              coordinate={{
                latitude: marker.latitude,
                longitude: marker.longitude,
              }}
              title={`ALERT ${index + 1}`}
            >
              <Image
                source={require('./img/alert2.png')}
                style={styles.markerImage}
              />

              <Callout style={styles.calloutContainerAlert}>
                <View>
                  <Text style={styles.textStyleTitle}>Alert</Text>
                  <Text style={styles.textStyle}>{'Time Of Measurement: '+marker.timeOfMeasurement}</Text>
                  <Text style={styles.textStyle}>{'Altitude: '+ marker.altitude}</Text>
                  <Text style={styles.textStyle}>{'Distance: '+ marker.distance}</Text>
                  <Text style={styles.textStyle}>{'Cause: '+ marker.cause_code}</Text>
                  <Text style={styles.textStyle}>{'Sub-Cause: '+ marker.subCause_code}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}
      {/* Pass the toastRef to Toast component */}
      <Toast ref={toastRef} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerImage: {
    width: 29,
    height: 35
  },
  textStyleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'black',
    textAlign: 'center',
  },
  textStyle: {
    fontSize: 11,
    color: 'black',
  },
  calloutContainer: {
    width: 152, // Set the width of the Callout
    height: 130, // Set the height of the Callout
    backgroundColor: 'white', // Set the background color
    padding: 10, // Add padding to the Callout content
  },
  calloutContainerAlert: {
    width: 152, // Set the width of the Callout
    height: 110, // Set the height of the Callout
    backgroundColor: '#ffb8b8', // Set the background color
    padding: 10, // Add padding to the Callout content
  }
});

export default App;
