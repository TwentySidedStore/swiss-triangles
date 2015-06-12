"use strict";

var swiss_tournament = function(p, r) {
    
    var players = +(p || 0);
    var rounds = +(r || calculate_rounds());
    var swiss = calculate_swiss();
    var records = calculate_records();
    
    function calculate_rounds() {
        if (players >= 227 && players <= 409) return 9;
        else if (players >= 410) return 10;
        return Math.ceil( Math.log(players) / Math.log(2) );
    };
    
    function calculate_swiss() {
      
        var s = [], rows = rounds + 1;
        var rows, row, col, quantity, left_parent, right_parent;
        
        // handle the root node by itself
        s[0] = [players];
        
        for (row = 1; row < rows; row++) {
            
            s[row] = [];
            
            for (col = 0; col <= row; col++) {
                
                left_parent = Math.floor(s[row-1][col-1] / 2);
                right_parent = Math.ceil(s[row-1][col] / 2);
                
                if (col === 0)
                    quantity = right_parent;
                else if (col === row)
                    quantity = left_parent;
                else
                    quantity = left_parent + right_parent;
                
                s[row][col] = quantity;
            }
        }
        
        return s;
    };
    
    function calculate_records() {
        
        var r, last_round;
        
        r = swiss.length - 1;
        last_round = swiss[r];
        
        return last_round.map( function(p, index) {
          return { wins: r - index, losses: index, players: p }  
        });
        
    };
        
    return {
        get_players: function() {
            return players;
        },
        
        get_rounds: function() {
            return rounds;
        },
                
        get_swiss_triangle: function() {
            return swiss;
        },
        
        get_records: function() {
            return records;
        }
    };
};
