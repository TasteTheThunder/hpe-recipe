pipeline {
    agent any

    environment {
        CHART_DIR       = 'helm/recipe-detection-chart'
        IMAGE_NAME      = 'hpe-recipe-detection'
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

        stage('Determine Chart Version') {
            steps {
                script {
                    // Read chart version from Chart.yaml
                    def chartYaml = readFile("${CHART_DIR}/Chart.yaml")
                    def versionMatch = chartYaml =~ /version:\s*(.+)/
                    env.CHART_VERSION = versionMatch[0][1].trim()
                    env.IMAGE_TAG = env.CHART_VERSION
                    env.RELEASE_NAME = "recipe-v${env.CHART_VERSION.replace('.', '-')}"
                    echo "Chart Version: ${env.CHART_VERSION}"
                    echo "Release Name: ${env.RELEASE_NAME}"
                }
            }
        }

        stage('Build Backend') {
            steps {
                dir('backend') {
                    bat 'mvn clean package -DskipTests'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    // Build image and load into minikube
                    bat "minikube image build -t ${IMAGE_NAME}:${IMAGE_TAG} ."
                }
            }
        }

        stage('Deploy to Minikube') {
            steps {
                script {
                    // Check if release already exists
                    def releaseExists = bat(
                        script: "${HELM_CMD} status ${RELEASE_NAME} --namespace ${KUBE_NAMESPACE} 2>nul",
                        returnStatus: true
                    ) == 0

                    if (releaseExists) {
                        bat """
                            ${HELM_CMD} upgrade ${RELEASE_NAME} ${CHART_DIR} \
                                --namespace ${KUBE_NAMESPACE} \
                                --set image.tag=${IMAGE_TAG}
                        """
                        echo "Upgraded Helm release: ${RELEASE_NAME}"
                    } else {
                        bat """
                            ${HELM_CMD} install ${RELEASE_NAME} ${CHART_DIR} \
                                --namespace ${KUBE_NAMESPACE} \
                                --set image.tag=${IMAGE_TAG}
                        """
                        echo "Installed new Helm release: ${RELEASE_NAME}"
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                script {
                    // Wait for rollout to complete
                    bat "kubectl rollout status deployment/${RELEASE_NAME}-recipe-detection --namespace ${KUBE_NAMESPACE} --timeout=120s"

                    // Show deployment status
                    bat "${HELM_CMD} list --namespace ${KUBE_NAMESPACE}"
                    bat "kubectl get pods --namespace ${KUBE_NAMESPACE} -l app.kubernetes.io/instance=${RELEASE_NAME}"
                    bat "kubectl get configmaps --namespace ${KUBE_NAMESPACE} -l app.kubernetes.io/instance=${RELEASE_NAME}"
                }
            }
        }

        stage('Update Release Status') {
            steps {
                script {
                    // Tell the Recipe Detection API that this version is now deployed
                    bat """
                        curl -s -X PUT ${API_URL}/helm-releases/${env.CHART_VERSION}/status ^
                            -H "Content-Type: application/json" ^
                            -d "{\\"status\\":\\"deployed\\"}"
                    """
                    echo "Updated release ${env.CHART_VERSION} status to deployed"
                }
            }
        }
    }

    post {
        success {
            echo "Successfully deployed chart version ${env.CHART_VERSION} as release ${env.RELEASE_NAME}"
        }
        failure {
            script {
                // Mark as failed in the API
                bat """
                    curl -s -X PUT ${API_URL}/helm-releases/${env.CHART_VERSION}/status ^
                        -H "Content-Type: application/json" ^
                        -d "{\\"status\\":\\"failed\\"}" 2>nul
                """
            }
            echo "Deployment failed for chart version ${env.CHART_VERSION}"
        }
        always {
            cleanWs()
        }
    }
}
