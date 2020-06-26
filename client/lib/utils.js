Utils = {
  // XXX We should remove these two methods
  goBoardId(_id) {
    const board = Boards.findOne(_id);
    return board && AppRouter.go('board', {
      id: board._id,
      slug: board.slug,
    });
  },

  goCardId(_id, edit) {
    const card = Cards.findOne(_id);
    const board = Boards.findOne(card.boardId);
    return board && AppRouter.go('card', {
      cardId: card._id,
      boardId: board._id,
      slug: board.slug,
      edit: edit?"1":"0"
    });
  },

  setupCardInSession(boardId, cardId, edit) {
    if (boardId)
      Session.set('currentBoard', boardId);
    Session.set('currentCard', cardId);

    Session.set('currentCardExtra', {
      id: cardId,
      edit: edit
    });

  },

  capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  windowResizeDep: new Tracker.Dependency(),

  // in fact, what we really care is screen size
  // large mobile device like iPad or android Pad has a big screen, it should also behave like a desktop
  // in a small window (even on desktop), Wekan run in compact mode.
  // we can easily debug with a small window of desktop browser. :-)
  isMiniScreen() {
    this.windowResizeDep.depend();
    return $(window).width() <= 800;
  },

  isCompactMiniScreen() {
    return this.isMiniScreen() && Features.opinions.robustUX.compactScreenInMobile
  },


  calculateIndexData(prevData, nextData, nItems = 1) {
    let base, increment;
    // If we drop the card to an empty column
    if (!prevData && !nextData) {
      base = 0;
      increment = 1;
      // If we drop the card in the first position
    } else if (!prevData) {
      base = nextData.sort - 1;
      increment = -1;
      // If we drop the card in the last position
    } else if (!nextData) {
      base = prevData.sort + 1;
      increment = 1;
    }
    // In the general case take the average of the previous and next element
    // sort indexes.
    else {
      const prevSortIndex = prevData.sort;
      const nextSortIndex = nextData.sort;
      increment = (nextSortIndex - prevSortIndex) / (nItems + 1);
      base = prevSortIndex + increment;
    }
    // XXX Return a generator that yield values instead of a base with a
    // increment number.
    return {
      base,
      increment,
    };
  },

  // Determine the new sort index
  calculateIndex(prevCardDomElement, nextCardDomElement, nCards = 1) {
    let base, increment;
    // If we drop the card to an empty column
    if (!prevCardDomElement && !nextCardDomElement) {
      base = 0;
      increment = 1;
      // If we drop the card in the first position
    } else if (!prevCardDomElement) {
      base = Blaze.getData(nextCardDomElement).sort - 1;
      increment = -1;
      // If we drop the card in the last position
    } else if (!nextCardDomElement) {
      base = Blaze.getData(prevCardDomElement).sort + 1;
      increment = 1;
    }
    // In the general case take the average of the previous and next element
    // sort indexes.
    else {
      const prevSortIndex = Blaze.getData(prevCardDomElement).sort;
      const nextSortIndex = Blaze.getData(nextCardDomElement).sort;
      increment = (nextSortIndex - prevSortIndex) / (nCards + 1);
      base = prevSortIndex + increment;
    }
    // XXX Return a generator that yield values instead of a base with a
    // increment number.
    return {
      base,
      increment,
    };
  },

  getBoardBodyComponent(component) {
    const p = component.parentComponent();
    if (!p) return p;
    return p.parentComponent();
  },

  // getBoardBodyComponent(component) {
  //   return component.parentComponent().parentComponent()
  // },
  // Detect touch device
  isTouchDevice() {
    const isTouchable = (() => {
      const prefixes = ' -webkit- -moz- -o- -ms- '.split(' ');
      const mq = function(query) {
        return window.matchMedia(query).matches;
      };

      if (('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch) {
        return true;
      }

      // include the 'heartz' as a way to have a non matching MQ to help terminate the join
      // https://git.io/vznFH
      const query = ['(', prefixes.join('touch-enabled),('), 'heartz', ')'].join('');
      return mq(query);
    })();
    Utils.isTouchDevice = () => isTouchable;
    return isTouchable;
  },

  optimizeForTouch() {
    return window.matchMedia('(max-width: 1199px)').matches;
  },

  calculateTouchDistance(touchA, touchB) {
    return Math.sqrt(
      Math.pow(touchA.screenX - touchB.screenX, 2) +
      Math.pow(touchA.screenY - touchB.screenY, 2)
    );
  },

  subscribedClickOnTouchSelectors : {},

  enableClickOnTouch(selector) {

    if (!Utils.subscribedClickOnTouchSelectors[selector]) {
      Utils.subscribedClickOnTouchSelectors[selector] = true;
      //console.log(`enableClickOnTouch: ${selector}`);
      let touchStart = null;
      let lastTouch = null;

      $(document).on('touchstart', selector, function(e) {
        touchStart = e.originalEvent.touches[0];
      });
      $(document).on('touchmove', selector, function(e) {
        const touches = e.originalEvent.touches;
        lastTouch = touches[touches.length - 1];
      });
      $(document).on('touchend', selector, function(e) {
        //console.log(`enableClickOnTouch::touchend: ${selector} ${e}`);
        if (touchStart && lastTouch && Utils.calculateTouchDistance(touchStart, lastTouch) <= 20) {
          e.preventDefault();
          const clickEvent = document.createEvent('MouseEvents');
          clickEvent.initEvent('click', true, true);
          e.target.dispatchEvent(clickEvent);
        }
      });
    }
  },

  manageCustomUI(){
    Meteor.call('getCustomUI', (err, data) => {
      if (err && err.error[0] === 'var-not-exist'){
        Session.set('customUI', false); // siteId || address server not defined
      }
      if (!err){
        Utils.setCustomUI(data);
      }
    });
  },

  setCustomUI(data){
    const currentBoard = Boards.findOne(Session.get('currentBoard'));
    if (currentBoard) {
      DocHead.setTitle(`${currentBoard.title  } - ${  data.productName}`);
    } else {
      DocHead.setTitle(`${data.productName}`);
    }
  },

  setMatomo(data){
    window._paq = window._paq || [];
    window._paq.push(['setDoNotTrack', data.doNotTrack]);
    if (data.withUserName){
      window._paq.push(['setUserId', Meteor.user().username]);
    }
    window._paq.push(['trackPageView']);
    window._paq.push(['enableLinkTracking']);

    (function() {
      window._paq.push(['setTrackerUrl', `${data.address}piwik.php`]);
      window._paq.push(['setSiteId', data.siteId]);

      const script = document.createElement('script');
      Object.assign(script, {
        id: 'scriptMatomo',
        type: 'text/javascript',
        async: 'true',
        defer: 'true',
        src: `${data.address}piwik.js`,
      });

      const s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(script, s);
    })();

    Session.set('matomo', true);
  },

  manageMatomo() {
    const matomo = Session.get('matomo');
    if (matomo === undefined){
      Meteor.call('getMatomoConf', (err, data) => {
        if (err && err.error[0] === 'var-not-exist'){
          Session.set('matomo', false); // siteId || address server not defined
        }
        if (!err){
          Utils.setMatomo(data);
        }
      });
    } else if (matomo) {
      window._paq.push(['trackPageView']);
    }
  },

  getTriggerActionDesc(event, tempInstance) {
    const jqueryEl = tempInstance.$(event.currentTarget.parentNode);
    const triggerEls = jqueryEl.find('.trigger-content').children();
    let finalString = '';
    for (let i = 0; i < triggerEls.length; i++) {
      const element = tempInstance.$(triggerEls[i]);
      if (element.hasClass('trigger-text')) {
        finalString += element.text().toLowerCase();
      } else if (element.hasClass('user-details')) {
        let username = element.find('input').val();
        if(username === undefined || username === ''){
          username = '*';
        }
        finalString += `${element.find('.trigger-text').text().toLowerCase() } ${  username}`;
      } else if (element.find('select').length > 0) {
        finalString += element.find('select option:selected').text().toLowerCase();
      } else if (element.find('input').length > 0) {
        let inputvalue = element.find('input').val();
        if(inputvalue === undefined || inputvalue === ''){
          inputvalue = '*';
        }
        finalString += inputvalue;
      }
      // Add space
      if (i !== length - 1) {
        finalString += ' ';
      }
    }
    return finalString;
  },

  toggleBoardHeader() {
    const fullScreenSelector = "#header-main-bar";
    $(fullScreenSelector).toggle("fast");
  }
};

// A simple tracker dependency that we invalidate every time the window is
// resized. This is used to reactively re-calculate the popup position in case
// of a window resize. This is the equivalent of a "Signal" in some other
// programming environments (eg, elm).
$(window).on('resize', () => Utils.windowResizeDep.changed());
