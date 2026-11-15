-- Strums Settings
local strumNum = 315
local strumMiddleNum = 100

-- Strums Alpha Settings
local quepuedodeciryoamobrawlstars = 0.15
local elhijodesuputisimamadredesgraciado = 1

local introVideoLol = getModSetting("EV")

function onUpdate()
	if not middlescroll then
		-- Dad StrumLines X
		setPropertyFromGroup('opponentStrums', 0, 'x', defaultOpponentStrumX0 - strumNum*10)
		setPropertyFromGroup('opponentStrums', 1, 'x', defaultOpponentStrumX1 - strumNum*10)
		setPropertyFromGroup('opponentStrums', 2, 'x', defaultOpponentStrumX2 - strumNum*10)
		setPropertyFromGroup('opponentStrums', 3, 'x', defaultOpponentStrumX3 - strumNum*10)
		
		-- Bf StrumLines X
		setPropertyFromGroup('playerStrums', 0, 'x', defaultPlayerStrumX0 - strumNum)
		setPropertyFromGroup('playerStrums', 1, 'x', defaultPlayerStrumX1 - strumNum)
		setPropertyFromGroup('playerStrums', 2, 'x', defaultPlayerStrumX2 - strumNum)
		setPropertyFromGroup('playerStrums', 3, 'x', defaultPlayerStrumX3 - strumNum)
		
		--Alpha Settings
		for i = 0, getProperty("opponentStrums.length") - 1 do
			setPropertyFromGroup("opponentStrums", i, "alpha", quepuedodeciryoamobrawlstars)
			setPropertyFromGroup("playerStrums", i, "alpha", elhijodesuputisimamadredesgraciado)
		end
	else
		-- Dad StrumLines X
		setPropertyFromGroup('opponentStrums', 0, 'x', defaultOpponentStrumX0 - strumMiddleNum*5)
		setPropertyFromGroup('opponentStrums', 1, 'x', defaultOpponentStrumX1 - strumMiddleNum*5)
		setPropertyFromGroup('opponentStrums', 2, 'x', defaultOpponentStrumX2 + strumMiddleNum*5)
		setPropertyFromGroup('opponentStrums', 3, 'x', defaultOpponentStrumX3 + strumMiddleNum*5)
		
		-- Bf StrumLines X
		setPropertyFromGroup('playerStrums', 0, 'x', defaultPlayerStrumX0)
		setPropertyFromGroup('playerStrums', 1, 'x', defaultPlayerStrumX1)
		setPropertyFromGroup('playerStrums', 2, 'x', defaultPlayerStrumX2)
		setPropertyFromGroup('playerStrums', 3, 'x', defaultPlayerStrumX3)

		--Alpha Settings
		for i = 0, getProperty("opponentStrums.length") - 1 do
			setPropertyFromGroup("opponentStrums", i, "alpha", quepuedodeciryoamobrawlstars)
			setPropertyFromGroup("playerStrums", i, "alpha", elhijodesuputisimamadredesgraciado)
		end
	end
end
	
--[[
setProperty('iconP1.visible', false)
setProperty('iconP2.visible', false)
setProperty('scoreTxt.visible', false)
setProperty('healthBar.visible', false)
setProperty('healthBarBG.visible', false)
setProperty('countdownReady.visible', false)
setProperty('countdownSet.visible', false)
setProperty('countdownGo.visible', false)
--]]

--setPropertyFromClass('Main', 'fpsVar.visible', false)
setPropertyFromClass('Main', 'fpsVar.alpha', 0.15)
--setProperty('scoreTxt.visible', false)
--setProperty('botplayTxt.visible', false)

--Left Bar
makeLuaSprite('LeftBar', 'empty', -2, 0)
makeGraphic('LeftBar', 145, 740, '00fd00')
setObjectCamera('LeftBar', 'camHUD')
setProperty('LeftBar.visible', true)

--Right Bar
makeLuaSprite('RightBar', 'empty', 1137, 0)
makeGraphic('RightBar', 145, 740, '00fd00')
setObjectCamera('RightBar', 'camHUD')
setProperty('RightBar.visible', true)
	
--Add Sprites
addLuaSprite('LeftBar', false)
addLuaSprite('RightBar', false)

-- Video on Star Song
function onSongStart()
	if introVideoLol then
		makeVideoSprite('myCutscene', 'GatoBros', 0, 0, 'camHUD', false) -- tag, videoFile, x, y, camera, shouldLoop
		-- setProperty('myCutscene_video.alpha', 0.5) -- The _video is **REQUIRED**
	end
end

--[[
-- Si lees esto es porque no lo necesito Lel
function onVideoFinished(tag)
    debugPrint('Video Finished! ('..tag..')') -- DISCLAMER! Will not call if the video has `shouldLoop` set to true!
end
-]]

-- Add Zoom Beat
function onUpdatePost()
	function onBeatHit()
		if curBeat >= 1 and curBeat % 2 == 0 and curBeat <= 64 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 68 and curBeat % 1 == 0 and curBeat <= 195 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 195 and curBeat % 2 == 0 and curBeat <= 387 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 387 and curBeat % 1 == 0 and curBeat <= 515 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 523 and curBeat % 2 == 0 and curBeat <= 653 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 681 and curBeat % 2 == 0 and curBeat <= 741 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 745 and curBeat % 2 == 0 and curBeat <= 809 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 813 and curBeat % 1 == 0 and curBeat <= 945 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		elseif curBeat >= 949 and curBeat % 2 == 0 and curBeat <= 1013 then
			setProperty('camGame.zoom', getProperty('camGame.zoom')+(0.025 * 1)) setProperty('camHUD.zoom', getProperty('camHUD.zoom') + (0.01 * 1))
		end
	end
end

function onDestroy()
	setPropertyFromClass('Main', 'fpsVar.visible', true)
	setPropertyFromClass('Main', 'fpsVar.alpha', 1)
end