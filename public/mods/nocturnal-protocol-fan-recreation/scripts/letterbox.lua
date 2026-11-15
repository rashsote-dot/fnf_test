local playerOffsetX = -70
local opponentOffsetX = -1000

function onCreate()
    local barWidth = 160

    makeLuaSprite('leftBar', '', 0, 0)
    makeGraphic('leftBar', barWidth, screenHeight, '000000')
    setObjectCamera('leftBar', 'other')
    addLuaSprite('leftBar', true)

    makeLuaSprite('rightBar', '', screenWidth - barWidth, 0)
    makeGraphic('rightBar', barWidth, screenHeight, '000000')
    setObjectCamera('rightBar', 'other')
    addLuaSprite('rightBar', true)
end

function onCreatePost()
    for i = 0,3 do
        setPropertyFromGroup('playerStrums', i, 'x',
            getPropertyFromGroup('playerStrums', i, 'x') + playerOffsetX)

        setPropertyFromGroup('opponentStrums', i, 'x',
            getPropertyFromGroup('opponentStrums', i, 'x') + opponentOffsetX)
    end
end

function onSpawnNote(id, data, type, sustain)
    if getPropertyFromGroup('notes', id, 'mustPress') then
        setPropertyFromGroup('notes', id, 'x',
            getPropertyFromGroup('notes', id, 'x') + playerOffsetX)
    else
        setPropertyFromGroup('notes', id, 'x',
            getPropertyFromGroup('notes', id, 'x') + opponentOffsetX)
    end
end