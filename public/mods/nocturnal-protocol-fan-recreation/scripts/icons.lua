local xPlayer = 880
local xEnemy = 280

function onUpdatePost()
    setProperty('iconP1.x', xPlayer)
    setProperty('iconP2.x', xEnemy)
end

function opponentNoteHit(id, direction, noteType, isSustainNote)
    if not isSustainNote then
        local health = getProperty('health')
        
        if health > 0.25 then
            setProperty('health', health - 0.019)
        end
    end
end