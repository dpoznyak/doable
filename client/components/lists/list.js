const { calculateIndex, enableClickOnTouch } = Utils;

BlazeComponent.extendComponent({
  // Proxy
  openForm(options) {
    this.childComponents('listBody')[0].openForm(options);
  },

  onCreated() {
    this.newCardFormIsVisible = new ReactiveVar(true);
  },

  // The jquery UI sortable library is the best solution I've found so far. I
  // tried sortable and dragula but they were not powerful enough four our use
  // case. I also considered writing/forking a drag-and-drop + sortable library
  // but it's probably too much work.
  // By calling asking the sortable library to cancel its move on the `stop`
  // callback, we basically solve all issues related to reactive updates. A
  // comment below provides further details.
  onRendered() {

    //QuickFilterController.reapplyFilter();

    const boardComponent = Utils.getBoardBodyComponent(this);

    function userIsMember() {
      return Meteor.user() && Meteor.user().isBoardMember() && !Meteor.user().isCommentOnly();
    }

    const itemsSelector = '.js-minicard:not(.placeholder, .js-card-composer)';
    const $cards = this.$('.js-minicards');

    if(Utils.optimizeForTouch()) {
      $( '.js-minicards' ).sortable({
        handle: '.handle',
      });
    }

    $cards.sortable({
      connectWith: '.js-minicards:not(.js-list-full)',
      tolerance: 'pointer',
      //appendTo: 'body', -> .board-canvas (from upstream)
      //appendTo: '.board-canvas',
      helper(evt, item) {
        const helper = item.clone();
        if (MultiSelection.isActive()) {
          const andNOthers = $cards.find('.js-minicard.is-checked').length - 1;
          if (andNOthers > 0) {
            helper.append($(Blaze.toHTML(HTML.DIV(
              { 'class': 'and-n-other' },
              TAPi18n.__('and-n-other-card', { count: andNOthers })
            ))));
          }
        }
        return helper;
      },
      distance: 7,
      items: itemsSelector,
      scroll: true,
      placeholder: 'minicard-wrapper placeholder',
      start(evt, ui) {
        ui.helper.css('z-index', 1000);
        ui.placeholder.height(ui.helper.height());
        EscapeActions.executeUpTo('popup-close');
        boardComponent.setIsDragging(true);
      },
      over(evt, ui) {
        ui.helper.removeClass('card-moving-out');
      },
      out(evt, ui) {
        // console.debug(`sortable:out ${evt} offset=${JSON.stringify(ui.offset)} pos=${JSON.stringify(ui.position)}`)

        ui.item.listIxOffset = null;
        if (Utils.isMiniScreen() && (evt.handleObj.type == "touchmove" || evt.handleObj.type == "mousemove")) {
          const listIxOffset = 1;
          if (ui.position.left < 0) {
            listIxOffset = -1;
          }
          ui.item.listIxOffset = listIxOffset;
          ui.helper.addClass('card-moving-out');
        }
      },
      stop(evt, ui) {
        // console.debug(`sortable:stop ${evt} offset=${JSON.stringify(ui.offset)} pos=${JSON.stringify(ui.position)} listIx=${ui.item.listIxOffset }`);

        // To attribute the new index number, we need to get the DOM element
        // of the previous and the following card -- if any.
        const prevCardDom = ui.item.prev('.js-minicard').get(0);
        const nextCardDom = ui.item.next('.js-minicard').get(0);
        const nCards = MultiSelection.isActive() ? MultiSelection.count() : 1;
        const sortIndex = calculateIndex(prevCardDom, nextCardDom, nCards);
        const listId = Blaze.getData(ui.item.parents('.list').get(0))._id;
        const list = null;
        let setLastCard = false;

        if (ui.item.listIxOffset ) {
          const lists = Boards.findOne(Session.get('currentBoard')).lists();
          const listIds = lists.map(l => l._id);
          const index = listIds.indexOf(listId);
          const newIndex = index + ui.item.listIxOffset;
          if (newIndex >= 0 && newIndex < listIds.length) {
            listId = listIds[newIndex];
            list = lists.map(l=>l)[newIndex];
            setLastCard = true;
          }
        }

        const swimlaneId = Blaze.getData(ui.item.parents('.swimlane').get(0))._id;

        // Normally the jquery-ui sortable library moves the dragged DOM element
        // to its new position, which disrupts Blaze reactive updates mechanism
        // (especially when we move the last card of a list, or when multiple
        // users move some cards at the same time). To prevent these UX glitches
        // we ask sortable to gracefully cancel the move, and to put back the
        // DOM in its initial state. The card move is then handled reactively by
        // Blaze with the below query.
        $cards.sortable('cancel');

        if (MultiSelection.isActive()) {
          Cards.find(MultiSelection.getMongoSelector()).forEach((card, i) => {
            card.move(swimlaneId, listId, sortIndex.base + i * sortIndex.increment);
          });
        } else {
          const cardDomElement = ui.item.get(0);
          const card = Blaze.getData(cardDomElement);
          const movingToDifferentList = listId != card.listId;
          const cancel = false;
          if (list && movingToDifferentList ) {
            const moveTo = prompt("Move to " + list.title + " at top? (🤦‍♂️ non-empty string = bottom)", "");
            if (moveTo!== null) {
              if (moveTo == "") { // top
                sortIndex.base = _.min(list.cards().map((c) => c.sort)) - 1;
              } else { // bottom
                sortIndex.base = _.max(list.cards().map((c) => c.sort)) + 1;
              }
            } else {
              cancel = true;
            }
          }
          if (sortIndex.base == Infinity) {
            sortIndex.base = 0;
          }
          if (!cancel) {
            card.move(swimlaneId, listId, sortIndex.base);
          }

          if (setLastCard) {
            Session.set('currentCardExtra', {
              id: card._id
            });
          }
        }
        boardComponent.setIsDragging(false);
      },
    });

    // ugly touch event hotfix
    if (Utils.isMiniScreen()) {
      enableClickOnTouch(itemsSelector);
    }

    // Disable drag-dropping if the current user is not a board member or is comment only
    this.autorun(() => {
      $cards.sortable('option', 'disabled', !userIsMember());
    });

    // We want to re-run this function any time a card is added.
    this.autorun(() => {
      const currentBoardId = Tracker.nonreactive(() => {
        return Session.get('currentBoard');
      });
      Cards.find({ boardId: currentBoardId }).fetch();
      Tracker.afterFlush(() => {
        $cards.find(itemsSelector).droppable({
          hoverClass: 'draggable-hover-card',
          accept: '.js-member,.js-label',
          drop(event, ui) {
            const cardId = Blaze.getData(this)._id;
            const card = Cards.findOne(cardId);

            if (ui.draggable.hasClass('js-member')) {
              const memberId = Blaze.getData(ui.draggable.get(0)).userId;
              card.assignMember(memberId);
            } else {
              const labelId = Blaze.getData(ui.draggable.get(0))._id;
              card.addLabel(labelId);
            }
          },
        });
      });
    });
  },
}).register('list');

Template.miniList.events({
  'click .js-select-list'() {
    const listId = this._id;
    Session.set('currentList', listId);
  },
});
