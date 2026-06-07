pipeline {
    agent any

    parameters {
        choice(name: 'CLUSTER', choices: ['dev', 'prod', 'qa', 'integration'], description: 'Select target cluster')
        string(name: 'RELEASE_NAME', defaultValue: '', description: 'Optional Helm release name')
        string(name: 'CHART_VERSION', defaultValue: '', description: 'Optional chart version override')
        booleanParam(name: 'DEPLOY_ON_TRIGGER', defaultValue: false, description: 'Set true for manual/API-triggered deployments')
    }

    environment {
        CHART_DIR       = 'helm/recipe-detection-chart'
        HELM_CMD        = 'helm'
        KUBE_NAMESPACE  = 'default'
        API_URL         = 'http://localhost:8081/api'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Validate Cluster Access') {
            steps {
                script {
                    sh "kubectl --context=${params.CLUSTER} get nodes"
                    echo "Using cluster: ${params.CLUSTER}"
                }
            }
        }

        stage('Determine Chart Version') {
            steps {
                script {
                    def chartYaml = readFile("${CHART_DIR}/Chart.yaml")
                    def versionLine = chartYaml.readLines().find { it.startsWith('version:') }

                    env.CHART_VERSION = params.CHART_VERSION?.trim() ? params.CHART_VERSION.trim() : versionLine.split(':')[1].trim()
                    env.RELEASE_NAME = params.RELEASE_NAME?.trim() ? params.RELEASE_NAME.trim() : "recipe-${params.CLUSTER}-v${env.CHART_VERSION.replace('.', '-')}"
                    env.DID_DEPLOY = 'false'

                    env.VALUES_FILE = "${CHART_DIR}/values-v${env.CHART_VERSION}.yaml"
                    env.HAS_VERSION_VALUES = fileExists(env.VALUES_FILE) ? 'true' : 'false'

                    echo "Chart Version: ${env.CHART_VERSION}"
                    echo "Release Name: ${env.RELEASE_NAME}"
                }
            }
        }

        stage('Deploy Helm (Config Only)') {
            when {
                not {
                    triggeredBy 'SCMTrigger'
                }
            }
            steps {
                script {
                    def valuesArg = env.HAS_VERSION_VALUES == 'true'
                        ? "-f ${env.VALUES_FILE}" : ""

                    def releaseExists = sh(
                        script: "${HELM_CMD} --kube-context ${params.CLUSTER} status ${RELEASE_NAME} --namespace ${KUBE_NAMESPACE} 2>/dev/null",
                        returnStatus: true
                    ) == 0

                    if (releaseExists) {
                        sh """
                            ${HELM_CMD} --kube-context ${params.CLUSTER} upgrade ${RELEASE_NAME} ${CHART_DIR} \
                                --namespace ${KUBE_NAMESPACE} \
                                ${valuesArg}
                        """
                        echo "Upgraded Helm release: ${RELEASE_NAME}"
                    } else {
                        sh """
                            ${HELM_CMD} --kube-context ${params.CLUSTER} install ${RELEASE_NAME} ${CHART_DIR} \
                                --namespace ${KUBE_NAMESPACE} \
                                ${valuesArg}
                        """
                        echo "Installed new Helm release: ${RELEASE_NAME}"
                    }

                    env.DID_DEPLOY = 'true'
                }
            }
        }

        stage('Verify ConfigMap') {
            when {
                not {
                    triggeredBy 'SCMTrigger'
                }
            }
            steps {
                script {
                    sh "${HELM_CMD} --kube-context ${params.CLUSTER} list --namespace ${KUBE_NAMESPACE}"
                    sh "kubectl --context=${params.CLUSTER} get configmaps --namespace ${KUBE_NAMESPACE} -l app.kubernetes.io/instance=${RELEASE_NAME}"
                }
            }
        }

        stage('Update Backend Status') {
            when {
                not {
                    triggeredBy 'SCMTrigger'
                }
            }
            steps {
                script {
                    sh """
                    curl -s -X PUT ${API_URL}/helm-releases/${env.CHART_VERSION}/status?cluster=${params.CLUSTER} \
                    -H "Content-Type: application/json" \
                    -d '{"status":"deployed"}'
                    """
                }
            }
        }
    }

    post {
        success {
            script {
                if (env.DID_DEPLOY == 'true') {
                    echo "Successfully deployed ${env.RELEASE_NAME} to ${params.CLUSTER}"
                } else {
                    echo "Build completed without deployment (SCM-triggered)"
                }
            }
        }
        failure {
            script {
                if (env.DID_DEPLOY == 'true') {
                    sh """
                    curl -s -X PUT ${API_URL}/helm-releases/${env.CHART_VERSION}/status?cluster=${params.CLUSTER} \
                    -H "Content-Type: application/json" \
                    -d '{"status":"failed"}' 2>/dev/null
                    """
                }
            }
        }
        always {
            cleanWs()
        }
    }
}