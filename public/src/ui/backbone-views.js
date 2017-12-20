var jquery = $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');

/**
 * Backbone view for the parameter entry
 */
var ParametersView = Backbone.View.extend({

    render: function () {
        // pass variables in using Underscore.js template
        var variables = {
            name: this.model.name,

        };

        // compile the template using underscore
        var template = _.template($("#parameters-template").html());
        template = template(variables);

        // load the compiled HTML into the Backbone "el"
        this.$el.html(template);

        // format after loading
        this.format(this.model);

        return this;
    },
    format: function ()
    {
        // hide rows with undefined data
        if (this.model.name == undefined)
            this.$el.find(".name").hide();

    },
});


module.exports = {
    ParametersView: ParametersView
}