const {RecaptchaEnterpriseServiceClient} = require('@google-cloud/recaptcha-enterprise');

/**
  * Crea una evaluación para analizar el riesgo de una acción de la IU.
  *
  * projectID: El ID del proyecto de Google Cloud.
  * recaptchaSiteKey: La clave reCAPTCHA asociada con el sitio o la aplicación
  * token: El token generado obtenido del cliente.
  * recaptchaAction: El nombre de la acción que corresponde al token.
  */
async function createAssessment({
  // PENDIENTE: Reemplaza el token y las variables de acción de reCAPTCHA antes de ejecutar la muestra.
  projectID = "siac-medica-1740832668269",
  recaptchaKey = "6LcVN-YqAAAAALQigm7l_9vyGaAAZEM9dAC4rqRr",
  token = "action-token",
  recaptchaAction = "action-name",
}) {
  // Crea el cliente de reCAPTCHA.
  // TODO: almacena en caché el código de generación de clientes (recomendado) o llama a client.close() antes de salir del método.
  const client = new RecaptchaEnterpriseServiceClient();
  const projectPath = client.projectPath(projectID);

  // Crea la solicitud de evaluación.
  const request = ({
    assessment: {
      event: {
        token: token,
        siteKey: recaptchaKey,
      },
    },
    parent: projectPath,
  });

  const [ response ] = await client.createAssessment(request);

  // Verifica si el token es válido.
  if (!response.tokenProperties.valid) {
    console.log(`The CreateAssessment call failed because the token was: ${response.tokenProperties.invalidReason}`);
    return null;
  }

  // Verifica si se ejecutó la acción esperada.
  // The `action` property is set by user client in the grecaptcha.enterprise.execute() method.
  if (response.tokenProperties.action === recaptchaAction) {
    // Obtén la puntuación de riesgo y los motivos.
    // Para obtener más información sobre cómo interpretar la evaluación, consulta:
    // https://cloud.google.com/recaptcha-enterprise/docs/interpret-assessment
    console.log(`The reCAPTCHA score is: ${response.riskAnalysis.score}`);
    response.riskAnalysis.reasons.forEach((reason) => {
      console.log(reason);
    });

    return response.riskAnalysis.score;
  } else {
    console.log("The action attribute in your reCAPTCHA tag does not match the action you are expecting to score");
    return null;
  }
}