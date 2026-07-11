import React from 'react';
import { ScrollView, StyleSheet, SafeAreaView, Text, View, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LegalScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Términos y Condiciones</Text>

        <Text style={styles.body}>
          Estos términos y condiciones se aplican a la aplicación ClickBook (en adelante denominada "Aplicación") para dispositivos móviles, la cual fue creada por Lidia Egea Gutiérrez (en adelante denominada "Proveedor del Servicio") como un servicio Freemium.
        </Text>

        <Text style={styles.body}>
          Al descargar o utilizar la Aplicación, aceptas automáticamente los siguientes términos. Se recomienda encarecidamente que leas y comprendas estos términos detenidamente antes de usar la Aplicación.
        </Text>

        <Text style={styles.h2}>Propiedad Intelectual y Restricciones</Text>
        <Text style={styles.body}>
          Queda estrictamente prohibida la copia o modificación no autorizada de la Aplicación, de cualquier parte de la misma o de nuestras marcas registradas. No se permiten los intentos de extraer el código fuente de la Aplicación, traducir la Aplicación a otros idiomas o crear versiones derivadas. Todos los derechos de marca, derechos de autor, derechos de base de datos y demás derechos de propiedad intelectual relacionados con la Aplicación siguen siendo propiedad del Proveedor del Servicio.
        </Text>

        <Text style={styles.h2}>Modificaciones y Tarifas</Text>
        <Text style={styles.body}>
          El Proveedor del Servicio se dedica a garantizar que la Aplicación sea lo más beneficiosa y eficiente posible. Por lo tanto, se reserva el derecho de modificar la Aplicación o de cobrar por sus servicios en cualquier momento y por cualquier motivo. El Proveedor del Servicio te asegura que cualquier cargo por la Aplicación o sus servicios te será comunicado de forma clara.
        </Text>

        <Text style={styles.h2}>Datos y Seguridad del Dispositivo</Text>
        <Text style={styles.body}>
          La Aplicación almacena y procesa los datos personales que has proporcionado al Proveedor del Servicio para poder prestar el Servicio. Es tu responsabilidad mantener la seguridad de tu teléfono y el acceso a la Aplicación.
        </Text>
        <Text style={styles.body}>
          Nota importante sobre la seguridad: El Proveedor del Servicio desaconseja encarecidamente realizar jailbreak o rootear tu teléfono (un proceso que consiste en eliminar las restricciones y limitaciones de software impuestas por el sistema operativo oficial de tu dispositivo). Estas acciones podrían exponer tu teléfono a malware, virus y programas maliciosos, comprometer las funciones de seguridad de tu teléfono y provocar que la Aplicación no funcione correctamente o deje de funcionar por completo.
        </Text>
        <Text style={styles.body}>
          Ten en cuenta que la Aplicación utiliza servicios de terceros que tienen sus propios Términos y Condiciones. A continuación se muestran los enlaces a los Términos y Condiciones de los terceros proveedores de servicios utilizados por la Aplicación:
        </Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://policies.google.com/terms')}>
          • Google Play Services
        </Text>
        <Text style={styles.link} onPress={() => Linking.openURL('https://expo.dev/terms')}>
          • Expo
        </Text>

        <Text style={styles.h2}>Limitación de Responsabilidad y Conectividad</Text>
        <Text style={styles.body}>
          Ten en cuenta que el Proveedor del Servicio no asume la responsabilidad de ciertos aspectos. Algunas funciones de la Aplicación requieren una conexión a internet activa, que puede ser Wi-Fi o proporcionada por tu proveedor de red móvil. El Proveedor del Servicio no se hace responsable si la Aplicación no funciona a su máxima capacidad debido a la falta de acceso a Wi-Fi o si has agotado tu saldo de datos.
        </Text>
        <Text style={styles.body}>
          Si utilizas la aplicación fuera de una zona Wi-Fi, ten en cuenta que se seguirán aplicando los términos del acuerdo con tu proveedor de red móvil. En consecuencia, es posible que tu proveedor de telefonía te cobre por el uso de datos durante la conexión a la aplicación, u otros cargos de terceros. Al utilizar la aplicación, aceptas la responsabilidad de dichos cargos, incluidos los cargos por itinerancia de datos (roaming) si utilizas la aplicación fuera de tu territorio de origen sin desactivar la itinerancia de datos. Si no eres el pagador de la factura del dispositivo en el que usas la aplicación, se asume que has obtenido el permiso del pagador.
        </Text>
        <Text style={styles.body}>
          Asimismo, el Proveedor del Servicio no siempre puede hacerse responsable del uso que hagas de la aplicación. Por ejemplo, es tu responsabilidad asegurarte de que tu dispositivo permanezca cargado. Si tu dispositivo se queda sin batería y no puedes acceder al Servicio, el Proveedor del Servicio no se hará responsable.
        </Text>
        <Text style={styles.body}>
          En cuanto a la responsabilidad del Proveedor del Servicio por el uso que hagas de la aplicación, es importante señalar que, si bien se esfuerzan por garantizar que esté actualizada y sea precisa en todo momento, dependen de terceros para que les proporcionen información y así podértela ofrecer a ti. El Proveedor del Servicio no acepta ninguna responsabilidad por cualquier pérdida, directa o indirecta, que experimentes como resultado de confiar plenamente en esta funcionalidad de la aplicación.
        </Text>

        <Text style={styles.h2}>Tecnologías de Inteligencia Artificial</Text>
        <Text style={styles.body}>
          La Aplicación incorpora tecnologías de Inteligencia Artificial (IA) para proporcionar ciertas funciones o servicios. Al utilizar la Aplicación, reconoces y aceptas que se puede utilizar IA para procesar datos y ofrecer funcionalidades. El Proveedor del Servicio garantiza que todo uso de la IA cumple con las leyes aplicables y está diseñado para mejorar la experiencia del usuario.
        </Text>

        <Text style={styles.h2}>Actualizaciones y Finalización del Servicio</Text>
        <Text style={styles.body}>
          Es posible que el Proveedor del Servicio desee actualizar la aplicación en algún momento. La aplicación está disponible actualmente según los requisitos del sistema operativo, los cuales pueden cambiar, por lo que deberás descargar las actualizaciones si deseas seguir utilizando la aplicación.
        </Text>
        <Text style={styles.body}>
          El Proveedor del Servicio no garantiza que siempre vaya a actualizar la aplicación para que sea relevante para ti y/o compatible con la versión particular del sistema operativo instalada en tu dispositivo. Sin embargo, te comprometes a aceptar siempre las actualizaciones de la aplicación cuando se te ofrezcan. El Proveedor del Servicio también puede desear dejar de proporcionar la aplicación y puede dar por terminado su uso en cualquier momento sin previo aviso de finalización. A menos que se te informe de lo contrario, tras cualquier rescisión:
        </Text>
        <Text style={styles.body}>• Los derechos y licencias otorgados en estos términos finalizarán.</Text>
        <Text style={styles.body}>• Deberás dejar de utilizar la aplicación y (si es necesario) eliminarla de tu dispositivo.</Text>

        <Text style={styles.h2}>Cambios a Estos Términos y Condiciones</Text>
        <Text style={styles.body}>
          El Proveedor del Servicio puede actualizar periódicamente sus Términos y Condiciones. Por lo tanto, se te aconseja revisar esta página regularmente para comprobar si hay cambios. El Proveedor del Servicio te notificará cualquier cambio publicando los nuevos Términos y Condiciones en esta página.
        </Text>
        <Text style={styles.body}>
          Estos términos y condiciones entran en vigor a partir del 6 de mayo de 2026.
        </Text>

        <Text style={styles.h2}>Contacto</Text>
        <Text style={styles.body}>
          Si tienes alguna pregunta o sugerencia sobre los Términos y Condiciones, no dudes en ponerte en contacto con el Proveedor del Servicio en: bookvibes.app@gmail.com.
        </Text>
        <Text style={styles.footer}>
          Esta página de Términos y Condiciones fue generada por el App Privacy Policy Generator.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scroll: { padding: 20, paddingTop: 20, paddingBottom: 40 },
  h1: { color: '#FFD700', fontSize: 18, fontWeight: '900', marginBottom: 14 },
  h2: { color: '#FFD700', fontSize: 13, fontWeight: '800', marginTop: 18, marginBottom: 6 },
  body: { color: '#CCCCCC', fontSize: 11, lineHeight: 17, marginBottom: 10 },
  link: { color: '#FFD700', fontSize: 11, marginBottom: 6, textDecorationLine: 'underline' },
  footer: { color: '#888888', fontSize: 10, marginTop: 24, textAlign: 'center' },
});