{{- define "fe.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fe.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "fe.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fe.labels" -}}
app.kubernetes.io/name: {{ include "fe.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "fe.selectorLabels" -}}
app.kubernetes.io/name: {{ include "fe.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
