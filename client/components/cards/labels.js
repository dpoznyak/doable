let labelColors;
Meteor.startup(() => {
  labelColors = Boards.simpleSchema()._schema['labels.$.color'].allowedValues;
});

BlazeComponent.extendComponent({
  onCreated() {
    this.currentColor = new ReactiveVar(this.data().color);
  },

  labels() {
    return labelColors.map((color) => ({ color, name: '' }));
  },

  isSelected(color) {
    return this.currentColor.get() === color;
  },

  events() {
    return [{
      'click .js-palette-color'() {
        this.currentColor.set(this.currentData().color);
      },
    }];
  },
}).register('formLabel');

Template.createLabelPopup.helpers({
  // This is the default color for a new label. We search the first color that
  // is not already used in the board (although it's not a problem if two
  // labels have the same color).
  defaultColor() {
    const labels = Boards.findOne(Session.get('currentBoard')).activeLabels();
    const usedColors = _.pluck(labels, 'color');
    const availableColors = _.difference(labelColors, usedColors);
    return availableColors.length > 1 ? availableColors[0] : labelColors[0];
  },
});

Template.cardLabelsPopup.events({
  'click .js-select-label'(evt) {
    const card = Cards.findOne(Session.get('currentCard'));
    const labelId = this._id;
    card.toggleLabel(labelId);
    evt.preventDefault();
  },
  'click .js-edit-label': Popup.open('editLabel'),
  'click .js-add-label': Popup.open('createLabel'),
});

Template.formLabel.events({
  'click .js-palette-color'(evt) {
    const $this = $(evt.currentTarget);

    // hide selected ll colors
    $('.js-palette-select').addClass('hide');

    // show select color
    $this.find('.js-palette-select').removeClass('hide');
  },
});

function getLabelDataFromTemplate(tpl) {
  const board = Boards.findOne(Session.get('currentBoard'));
  const name = tpl.$('#labelName').val().trim();
  const color = Blaze.getData(tpl.find('.fa-check')).color;
  const archived =  tpl.$('#labelArchived').is(":checked");
  const rank = parseInt( tpl.$('#labelRank').val()) || 0;
  const nameParsed = splitLabelName(name);
  return {board, name, color, archived, rank, shortName: nameParsed.shortName, altName: nameParsed.altName};
}

function splitLabelName(name) {
  const parsed = /(.+?)\s*\((.*)\)/g.exec(name);
  if (parsed !== null) {
    const [_, shortName, altName ] = parsed;
    return {shortName, altName};
  }
  return { shortName: name};
}


Template.createLabelPopup.events({
  // Create the new label
  'submit .create-label'(evt, tpl) {
    evt.preventDefault();
    const label = getLabelDataFromTemplate(tpl);
    label.board.addLabel(label);
    Popup.back();
  },
});

Template.editLabelPopup.events({
  'click .js-delete-label': Popup.afterConfirm('deleteLabel', function() {
    const board = Boards.findOne(Session.get('currentBoard'));
    board.removeLabel(this._id);
    Popup.back(2);
  }),
  'submit .edit-label'(evt, tpl) {
    evt.preventDefault();
    const label = getLabelDataFromTemplate(tpl);
    label.board.editLabel(this._id, label);
    Popup.back();
  },
});

Template.cardLabelsPopup.helpers({
  isLabelSelected(cardId) {
    return _.contains(Cards.findOne(cardId).labelIds, this._id);
  },

  labels(board) {
    const cardLabelIds = this.labelIds;
    return _.filter(board.allLabels(), l => !l.archived || _.contains(cardLabelIds, l._id));
  }
});
