var jquery = $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');

let parameterList = {
    proteomicsPlatformFile:{title:"Proteomics platform file", type:"text", defaultValue: "PNNL-causality-formatted.txt" },
    proteomicsValuesFile:{title:"Proteomics values file", type:"text",  defaultValue: "PNNL-causality-formatted.txt" },
    idColumn:{title:"ID Column", type:"text",  defaultValue: "ID" },
    symbolsColumn:{ title:"Symbols column", type:"text",  defaultValue: "Symbols" },
    sitesColumn:{title:"Sites column", type:"text",  defaultValue: "Sites" },
    effectColumn:{title:"Effect column", type:"text",  defaultValue: "Effect" },
    doLogTransform:{title:"Do Log transform", type:"checkbox",  defaultValue: "false" },
    thresholdForDataSignificance:{title:"Threshold for data significance", type:"number", defaultValue: 0.05, step : 0.001 },
    fdrThresholdForDataSignificance:{title:"FDR threshold for data significance", type:"number",  defaultValue: 0.05, step : 0.001 },
    poolProteomicsForFdrAdjustment:{title:"Pool proteomics for Fdr adjustment", type:"checkbox",  defaultValue: "false" },
    fdrThresholdForNetworkSignificance:{title:"FDR threshold for network significance", type:"number", defaultValue: 0.05, step : 0.001 },
    pValThresholdForCorrelation:{ title:"P-value threshold for correlation", type:"number",  defaultValue: 0.05, step : 0.001 },
    valueTransformation:{title:"Value transformation", type:"select",  defaultValue: 0, options: ["arithmetic-mean", "geometric-mean", "max", "difference-of-means", "fold-change-of-mean",
    "significant-change-of-mean", "correlation"]},
    customResourceDirectory: {title:"Custom resource directory:", type:"text", defaultValue: "" },
    siteEffectProximityThreshold:{ title:"Site effect proximity threshold", type:"number",  defaultValue: 0.05, step : 0.001 },
    siteMatchProximityThreshold:{ title:"Site match proximity threshold", type:"number",  defaultValue: 0.05, step : 0.001 },
    defaultMissingValue:{ title:"Default missing value", type:"number", defaultValue: 0 },
    relationFilterType:{title:"Relation filter type", type:"select", defaultValue: 0, options: ["no-filter", "phospho-only", "expression-only", "phospho-primary-expression-secondary"]},
    geneFocus:{title:"Gene focus", type:"text", defaultValue: "" },
    calculateNetworkSignificance:{title:"Calculate network significance", type:"checkbox",  defaultValue: "false" },
    permutationsForSignificance:{ title:"Permutations for significance", type:"integer",  defaultValue: 0 },
    tcgaDirectory:{title:"TCGA directory", type:"text", defaultValue: "" },
    mutationEffectFile:{title:"Mutation effect file", type:"text", defaultValue: "" },
    colorSaturationValue:{title:"Color saturation value", type:"number", defaultValue: 5, min: 0.0 },
    doSiteMatching:{title:"Do site matching", type:"checkbox", defaultValue: "false" },
    showUnexplainedProteomicData:{title:"Show unexplained proteomic data", type:"checkbox", defaultValue: "false" },
    builtInNetworkResourceSelection:{title:"Built-in network resources selection", type:"select", defaultValue: 0, options: ["PC", "REACH", "PhosphoNetworks", "IPTMNet", "TRRUST", "TFactS"]},
    generateDataCentricGraph:{title:"Generate data-centric graph", type:"checkbox", defaultValue: "false" },
    correlationUpperThreshold:{title:"Correlation upper threshold", type:"number", defaultValue: 1.0, max : 1.0, min : 0.0, step : 0.001 },
    minimumSampleSize:{title:"Minimum sample size", type:"integer", defaultValue: 3 , min: 3},
    geneActivity:{title:"Gene activity", type:"text", defaultValue: "" },
    tfActivityFile:{title:"Tf activity file", type:"text", defaultValue: "" },
    useStrongestProteomicDataPerGene:{title:"Use strongest proteomic data per gene", type:"check", defaultValue: "false" },
    useNetworkSignificanceForCausalReasoning:{title:"Use network significance for causal reasoning", type:"check", defaultValue: "false" },
    minimumPotentialTargetsToConsiderForDownstreamSignificance:{title:"Minimum potential targets to consider for downstream significance", type:"integer", defaultValue: 1, min: 1 },
    showInsignificantProteomicData:{title:"Show insignificant proteomic data", type:"check", defaultValue: "false" },
    valueColumn:{title:"Value column", type:"text", defaultValue: "" },
    controlValueColumn:{title:"Control Value column", type:"text", defaultValue: "" },
    testValueColumn:{title:"Test Value column", type:"text", defaultValue: "" }
}

const camelToDash = str => str
    .replace(/(^[A-Z])/, ([first]) => first.toLowerCase())
    .replace(/([A-Z])/g, ([letter]) => `-${letter.toLowerCase()}`)

let ParametersModel = Backbone.Model.extend({
    defaults:{

    }
});

/**
 * Backbone view for the parameter entry
 */
let ParametersView = Backbone.View.extend({

    el: '#parameters-table',

    events: {
        "click #submit-button" : "updateParameters",
        "click #reset-button" : "resetParameters"
    },

    variables: {

    },

    initialize: function(){
        for(var param in parameterList){
            this.variables[param] = parameterList[param].defaultValue;
        }
        this.fillParameterTable();
    },

    render: function () {

        // compile the template using underscore
        // var template = _.template($("#parameters-template").html());
        var template = _.template((this.pTable));
        template = template(this.variables);


        this.$el.html(template);


        return this;
    },

    fillParameterTable: function(){

        let self = this;
        this.pTable = '<div class="w3-modal-content" > ' +
            '<div class="w3-modal-container parameters">' +
            ' <header class="w3-container w3-blue-gray"> ' +
            '<span onclick="document.getElementById(\'parameters-table\').style.display=\'none\'" class="w3-button w3-display-topright close-button">&times;</span> ' +
            '<h2>Parameters</h2> </header> <p></p><table><tbody>';


        for(var param in parameterList){

            if(parameterList[param].type === "select") {
                self.pTable += '<tr><td>' + parameterList[param].title + ': <select id = ' + camelToDash(param) + '>';

                for(let i = 0; i < parameterList[param].options.length; i++){
                    self.pTable += '<option value = ' + i + '>' + parameterList[param].options[i] + '</option>';
                }

                self.pTable += '</td></tr>';
            }
            else {
                self.pTable += '<tr><td>' + parameterList[param].title + ': <input class = "parameters-input" id = ' + camelToDash(param) + ' type = ' + parameterList[param].type;
                if(parameterList[param].step)
                    self.pTable += 'step = ' + parameterList[param].step;
                if(parameterList[param].min)
                    self.pTable += 'min = ' + parameterList[param].min;
                if(parameterList[param].max)
                    self.pTable += 'max = ' + parameterList[param].max;

                self.pTable += ' value= <%= ' + param +' %>> </td></tr>';
            }




        }

        this.pTable += '</tbody></table></div></div>';

    }

});


module.exports = {
    ParametersView: ParametersView
}